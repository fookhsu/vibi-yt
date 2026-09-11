# YouTube Digest：Pi 调度、后台执行与通知能力边界

> 对应 GitHub issue [#18](https://github.com/fookhsu/vibi-yt/issues/18)，为地图 [#16](https://github.com/fookhsu/vibi-yt/issues/16) 提供一手事实。

## 结论先行

**Pi core 可以可靠承载“当前活着的 Host 会话中的扩展生命周期、用户 Command、模型 Tool、文件写入和会话内 UI”，但没有内建定时任务、守护进程或 background bash。** 当前环境里的 `schedule.*`、detached background run、结果 watcher 和 completion wake 都来自另一个 Pi package——`pi-subagents`——不是 Pi core，也不是 `vibi-yt` 当前依赖。

因此，`vibi-yt` 可以直接提供：

1. Host-neutral 的“立即生成 Digest” Action；
2. Pi 上的 `/youtube:digest` 一类 Command；
3. 自己拥有的 Interest / history / run ledger；
4. 自己原子写出的 Markdown 与 JSON artifact；
5. Host 在线时的 Pi UI 提示。

但 `vibi-yt` **不能把下列行为作为基础保证**：Pi 退出后仍准时触发、离线期间自动补跑、OS 级通知一定送达、或 `pi-subagents` 一定已安装且版本兼容。可靠的 wall-clock 调度需要一个明确的外部 launcher（launchd/systemd/cron/长期服务）调用稳定的非模型入口；若选择复用 `pi-subagents`，必须把它定义成显式可选集成，并接受其当前 fixed-interval / `overlap: skip` / `catchUp: latest|none` 边界。

## 调查基线与来源等级

检查日期以本报告提交为准；源码链接全部固定到 commit，而不是 `main`。

| 组件 | 检查版本 | 固定源码 | 在本报告中的身份 |
| --- | --- | --- | --- |
| `@earendil-works/pi-coding-agent` | `0.85.1` | [`d981de1`](https://github.com/earendil-works/pi/tree/d981de1229ef899957bbe968bc8dcda02a21f477) | Pi core / 官方扩展 API；安装包的 [`package.json` 声明 0.85.1](https://github.com/earendil-works/pi/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/coding-agent/package.json#L1-L4) |
| `pi-subagents` | npm `0.66.0` | npm `gitHead` [`0fc0eeb`](https://github.com/nicobailon/pi-subagents/tree/0fc0eebb9604970c506708b7508d6aa38921fde2) | 第三方 Pi package；其 own schedule/background 行为的一手来源，[版本声明](https://github.com/nicobailon/pi-subagents/blob/0fc0eebb9604970c506708b7508d6aa38921fde2/package.json#L1-L7) |
| `vibi-yt` | `0.2.0`，调查起点 `af2cb5f` | [`af2cb5f`](https://github.com/fookhsu/vibi-yt/tree/af2cb5f56366162808e3f9d7e4b689e81d8501fd) | 目标 package 当前能力 |

Pi 自己明确把 sub-agents 等能力留给扩展或第三方 package，并明确写着 **“No background bash. Use tmux.”**；所以不能因当前会话碰巧装了 `pi-subagents` 就把它归为 Pi core（[Pi README, lines 495–509](https://github.com/earendil-works/pi/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/coding-agent/README.md#L495-L509)）。

## 能力归属总表

| 能力 | 实际提供者 | 事实 | `vibi-yt` 能否可靠依赖 |
| --- | --- | --- | --- |
| 扩展加载、事件、Tool、Command | Pi core | `ExtensionAPI` 有 lifecycle events、`registerTool`、`registerCommand`、消息与会话 entry；没有 schedule/cron 方法（[类型声明, lines 1250–1400](https://github.com/earendil-works/pi/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/coding-agent/src/core/extensions/types.ts#L1250-L1400)） | **能**，但仅在已加载且仍活着的 Pi session/runtime 中 |
| 手动立即生成 | `vibi-yt` core Action + Pi adapter Command | Command handler 是用户触发入口；当前 adapter 已按此模式把 Action 映射为 `/youtube:*`（[`adapters/pi/index.ts`, lines 39–87](https://github.com/fookhsu/vibi-yt/blob/af2cb5f56366162808e3f9d7e4b689e81d8501fd/adapters/pi/index.ts#L39-L87)） | **能**；应继续保持 Action 属于 core、Command 名属于 Host |
| 进程内 timer / watcher | 扩展自己的 Node 代码 | 扩展拥有完整进程权限，也可用 Node built-ins；官方要求不要在 factory 启动长生命周期资源，而应在 `session_start` 启动并在 `session_shutdown` 幂等清理（[Pi extensions, lines 139–152, 220–224](https://github.com/earendil-works/pi/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/coding-agent/docs/extensions.md#L139-L152)） | **只能依赖为“Host 活着时的优化”**；不是 daemon、不是离线保证 |
| 定时 schedule | `pi-subagents` 0.66.0 | fixed interval / one-shot、持久定义、`catchUp` 与 overlap 策略都由该 package 实现（[missions, lines 86–123](https://github.com/nicobailon/pi-subagents/blob/0fc0eebb9604970c506708b7508d6aa38921fde2/docs/missions.md#L86-L123)） | **基础 package 不可依赖**；只有在显式安装、定版本、适配后才可作为可选集成 |
| detached background child | `pi-subagents` 0.66.0 | background child 在 detached runner process 中运行并写 lifecycle artifacts（[observability, lines 5–25](https://github.com/nicobailon/pi-subagents/blob/0fc0eebb9604970c506708b7508d6aa38921fde2/docs/observability.md#L5-L25)） | **不可作为 Pi core 能力**；当前 `vibi-yt` 没有此依赖 |
| `schedule.run-due` | `pi-subagents` 的 `subagent` action | 文档把它定义为“让外部 launcher 处理 due work，而不把 package 变成 daemon”（[missions, lines 109–120](https://github.com/nicobailon/pi-subagents/blob/0fc0eebb9604970c506708b7508d6aa38921fde2/docs/missions.md#L109-L120)） | **不能当作现成通用 launcher API**；见“外部 launcher”一节 |
| Pi 内通知 | Pi core `ctx.ui` | `notify(message, info|warning|error)` 是 UI 方法（[类型声明, lines 129–150](https://github.com/earendil-works/pi/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/coding-agent/src/core/extensions/types.ts#L129-L150)） | **能做 best-effort 当前会话提示**，不能当 durable delivery |
| OS/桌面通知 | 终端协议或外部设施 | 官方示例自己输出 OSC 777/99 或调用 Windows toast，并非 core delivery service（[notify example, lines 1–56](https://github.com/earendil-works/pi/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/coding-agent/examples/extensions/notify.ts#L1-L56)） | **不可保证**；终端、客户端、权限和活会话缺一不可 |
| Markdown/JSON 文件 | `vibi-yt` 自己的 core/storage | 扩展有完整文件系统权限；Pi 没有“产品 artifact registry”方法 | **能**，前提是 `vibi-yt` 明确定义路径、原子提交和 schema；不要借 debug artifact 当产品存储 |
| 用户配置 | Pi settings 或 package-owned 文件 | Pi settings 只有 global/project 两级，资源路径也在其中（[settings, lines 1–22, 277–318](https://github.com/earendil-works/pi/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/coding-agent/docs/settings.md#L1-L22)） | **应由 `vibi-yt` own**；Pi 没有自动分配 extension 配置 namespace |
| 会话内状态 | Pi `appendEntry` | custom entry 写进 session JSONL、不进模型上下文，可在 reload 后重建（[extensions, lines 1471–1487](https://github.com/earendil-works/pi/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/coding-agent/docs/extensions.md#L1471-L1487)） | **只适合 session-local UI/恢复线索**；不适合跨 session 的 Interest、去重历史或 schedule truth |

## 事实

### 1. Pi core 扩展生命周期

1. Pi 启动时加载扩展，然后发出 `session_start`; `/new`、`/resume`、`/fork`、`/clone` 和 `/reload` 都会先 teardown 旧 extension runtime，再创建并绑定新实例。退出时发出 `session_shutdown`（[完整 lifecycle, lines 273–349](https://github.com/earendil-works/pi/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/coding-agent/docs/extensions.md#L273-L349)）。
2. `session_start.reason` 只有 `startup | reload | new | resume | fork`；`session_shutdown.reason` 只有 `quit | reload | new | resume | fork`。官方要求旧实例清理内存资源，新实例从持久状态恢复（[session events, lines 389–450, 516–525](https://github.com/earendil-works/pi/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/coding-agent/docs/extensions.md#L389-L450)）。
3. lifecycle 列表没有 `timer`、`schedule_due`、`wake` 或 OS resume 事件；`ExtensionAPI` 类型也没有 schedule/cron/background 方法（[类型声明, lines 1252–1381](https://github.com/earendil-works/pi/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/coding-agent/src/core/extensions/types.ts#L1252-L1381)）。
4. `agent_end` 不是最终静止点，因为后面可能还有 retry、compaction retry 或 queued follow-up；需要“整轮完全结束”的观察者应使用 `agent_settled`（[extensions, lines 567–580](https://github.com/earendil-works/pi/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/coding-agent/docs/extensions.md#L567-L580)）。这对“生成完成后再通知”很重要。
5. `ctx.signal` 通常只在 active turn 期间存在；session event、空闲 Command 等上下文通常没有 signal（[extensions, lines 1019–1029](https://github.com/earendil-works/pi/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/coding-agent/docs/extensions.md#L1019-L1029)）。后台 job 不能误把它当永久 cancellation token。

### 2. Commands、Actions 与手动执行

1. Pi `registerCommand` 注册用户可输入的 slash command；Command 与 Tool 是两条不同入口（[ExtensionAPI type, lines 1303–1317](https://github.com/earendil-works/pi/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/coding-agent/src/core/extensions/types.ts#L1303-L1317)）。
2. `vibi-yt` 的规范已经明确：Action 属于 core、Command 名属于 Host；Pi adapter 只是翻译层（[`CONTEXT.md`, lines 73–99](https://github.com/fookhsu/vibi-yt/blob/af2cb5f56366162808e3f9d7e4b689e81d8501fd/CONTEXT.md#L73-L99)）。当前 adapter 也确实只注册 YouTube Tools、五个 Action Commands，并在 shutdown 关闭 OAuth loopback（[`adapters/pi/index.ts`, lines 62–92](https://github.com/fookhsu/vibi-yt/blob/af2cb5f56366162808e3f9d7e4b689e81d8501fd/adapters/pi/index.ts#L62-L92)）。
3. 因此“立即生成 Digest”可以可靠表达为新的 Host-neutral Action，再由 Pi adapter 暴露为 Command。它不需要假装成 schedule，也不应要求模型决定是否触发用户动作。
4. 若扩展确实要启动一个 agent turn，Pi 提供 `sendMessage(..., { triggerTurn })` 和 `sendUserMessage()`；但这仍只作用于当前 session，并遵守 streaming queue 语义（[extensions, lines 1416–1467](https://github.com/earendil-works/pi/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/coding-agent/docs/extensions.md#L1416-L1467)）。它不是跨进程 job queue。

### 3. Pi core 没有 background/schedule；timer 只能依附活进程

1. Pi 官方 README 直接声明没有 background bash，并建议 tmux（[README, lines 495–509](https://github.com/earendil-works/pi/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/coding-agent/README.md#L495-L509)）。
2. 扩展当然可以用 Node `setTimeout`、`fs.watch` 或 `child_process`，因为它以用户完整权限运行；官方也给了 `fs.watch` 后 `pi.sendMessage(..., { triggerTurn: true })` 的示例（[file-trigger example, lines 1–40](https://github.com/earendil-works/pi/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/coding-agent/examples/extensions/file-trigger.ts#L1-L40)）。但这个示例本身依附 `session_start` 和当前进程。
3. 官方生命周期规则要求 session-scoped timer/watcher/process 在 `session_shutdown` 清理（[extensions, lines 220–224](https://github.com/earendil-works/pi/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/coding-agent/docs/extensions.md#L220-L224)）。因此“扩展内 `setTimeout`”只能减少在线时延，不能证明机器睡眠、Pi 退出或 Host 回收 session 后仍会执行。

### 4. `pi-subagents` schedule 的精确边界

以下事实只属于 `pi-subagents` npm 0.66.0：

1. schedule 定义默认保存在项目 `.pi/subagents/schedules/<id>/`；可用 `scheduledRuns.storeRoot` 搬到用户绝对路径，并按 project cwd hash 隔离（[configuration, lines 336–350](https://github.com/nicobailon/pi-subagents/blob/0fc0eebb9604970c506708b7508d6aa38921fde2/docs/configuration.md#L336-L350)；[source, lines 94–101](https://github.com/nicobailon/pi-subagents/blob/0fc0eebb9604970c506708b7508d6aa38921fde2/src/runs/background/scheduled-runs.ts#L94-L101)）。
2. 触发只支持 one-shot `+Ns|m|h|d` 或带 timezone 的 ISO timestamp，以及 recurring fixed interval `Nm|h|d|w`；没有 cron/calendar/timezone recurrence（[source, lines 104–141](https://github.com/nicobailon/pi-subagents/blob/0fc0eebb9604970c506708b7508d6aa38921fde2/src/runs/background/scheduled-runs.ts#L104-L141)；[missions, lines 109–120](https://github.com/nicobailon/pi-subagents/blob/0fc0eebb9604970c506708b7508d6aa38921fde2/docs/missions.md#L109-L120)）。
3. schedule record 把 `overlap` 固定为 `skip`，`catchUp` 限定为 `none | latest`；run state 只有 `running | skipped | missed | completed | failed_launch | failed_run`（[source, lines 31–75](https://github.com/nicobailon/pi-subagents/blob/0fc0eebb9604970c506708b7508d6aa38921fde2/src/runs/background/scheduled-runs.ts#L31-L75)）。
4. 每次 fire 都强制 `async: true`、`context: "fresh"`、`mission: false`，并把 schedule origin 附在 completion 上（[source, lines 434–461](https://github.com/nicobailon/pi-subagents/blob/0fc0eebb9604970c506708b7508d6aa38921fde2/src/runs/background/scheduled-runs.ts#L434-L461)）。所以它不会恢复某个已有对话上下文，也没有自动 mission/state。
5. interval 的 next time 从原 planned time 前进，而不是从完成时刻前进；`latest` 在恢复时把多个落空 slot 折叠到“最新一个 planned instant”，不会逐个 replay（[source, lines 394–412](https://github.com/nicobailon/pi-subagents/blob/0fc0eebb9604970c506708b7508d6aa38921fde2/src/runs/background/scheduled-runs.ts#L394-L412)）。
6. 恢复时，`catchUp: none` 会记录一个 `missed` 并把 next time 跳到未来；`latest` 会 arm 一个立即到期的 timer 来启动最新 slot（[source, lines 719–779](https://github.com/nicobailon/pi-subagents/blob/0fc0eebb9604970c506708b7508d6aa38921fde2/src/runs/background/scheduled-runs.ts#L719-L779)）。
7. overlap 通过 `activeRunId` 加一个以 `wx` 创建的 `active.lock` 跳过；不会 queue 或 replace。每个到期 slot 碰到 active run 时会记为 skipped；完成收尾时若 next time 仍已过期，还会把最新过期 slot 记为 skipped 并把 next time 前进到未来（[source, lines 795–918](https://github.com/nicobailon/pi-subagents/blob/0fc0eebb9604970c506708b7508d6aa38921fde2/src/runs/background/scheduled-runs.ts#L795-L918)）。
8. definitions、最多 100 条 history、append-only events 和 per-run record 会落盘，相关文件以私有模式写出（[source, lines 345–381](https://github.com/nicobailon/pi-subagents/blob/0fc0eebb9604970c506708b7508d6aa38921fde2/src/runs/background/scheduled-runs.ts#L345-L381)）。这证明 schedule metadata durable，不等于 timer daemon durable。
9. timer 在 session/runtime install 时恢复并 arm；extension cleanup 会 `scheduledRunManager.stop()`，清除全部 timers（[`src/extension/index.ts`, lines 990–1009, 1014–1041](https://github.com/nicobailon/pi-subagents/blob/0fc0eebb9604970c506708b7508d6aa38921fde2/src/extension/index.ts#L990-L1041)；[`scheduled-runs.ts`, lines 509–538](https://github.com/nicobailon/pi-subagents/blob/0fc0eebb9604970c506708b7508d6aa38921fde2/src/runs/background/scheduled-runs.ts#L509-L538)）。timer 还调用了 `unref()`，不会仅因未来 schedule 阻止 Node 进程退出（[source, lines 764–779](https://github.com/nicobailon/pi-subagents/blob/0fc0eebb9604970c506708b7508d6aa38921fde2/src/runs/background/scheduled-runs.ts#L764-L779)）。

**含义：**“schedule 是 durable 的”只表示定义和 ledger 落盘；真正触发仍需要某个加载了该 extension 的活 Pi runtime，或另一个 launcher 主动调用 `schedule.run-due`。

### 5. 外部 launcher 仍是独立设施

`pi-subagents` 文档说 `schedule.run-due` 可由外部 launcher 调用，但 0.66.0 并没有把 schedule 模块导出成公共 TypeScript subpath：package exports 列表没有 schedule API（[`package.json`, lines 8–22](https://github.com/nicobailon/pi-subagents/blob/0fc0eebb9604970c506708b7508d6aa38921fde2/package.json#L8-L22)）。其公开 in-process event-bus RPC 的 `manage` allowlist 也只有 `schedule.list/show/history/pause/resume/run/delete`，明确没有 `schedule.create` 和 `schedule.run-due`（[extension API, lines 117–131](https://github.com/nicobailon/pi-subagents/blob/0fc0eebb9604970c506708b7508d6aa38921fde2/docs/extension-api.md#L117-L131)）。

所以当前可确认的边界是：

- `schedule.run-due` 是 `subagent` model-facing management action 的一部分；
- 外部进程必须先启动一个加载了 `pi-subagents`、打开相应项目并建立 context 的 Pi Host，再通过某种 Host integration 触发该 action；
- `pi-subagents` 0.66.0 没有为任意外部程序提供已文档化的 direct CLI / exported schedule API；
- 让 cron 启动 `pi -p` 再靠模型选择 tool，不是确定性的产品 scheduler contract。

对 `vibi-yt` 而言，真正可靠的外部 launcher 需要一个**稳定、无模型参与、幂等**的入口（例如未来的 CLI 或 SDK function）来做 `claim due slot → generate → commit artifacts → record outcome`。launchd/systemd/cron 本身属于部署设施，不属于 Pi 或 `vibi-yt` extension lifecycle。

### 6. 后台执行、重启与 notification loss

1. `pi-subagents` background run 是 detached runner process，因此能在 parent 交还控制后继续（[observability, lines 9–25](https://github.com/nicobailon/pi-subagents/blob/0fc0eebb9604970c506708b7508d6aa38921fde2/docs/observability.md#L9-L25)）。这仍是该 package 的能力，不是 Pi core background bash。
2. 宿主 session 的寿命决定 completion wake 能否送达。session shutdown 会停止 result watcher 并 dispose notifier；detached child 继续完成，但“notifies nobody”（[extension API, lines 498–506](https://github.com/nicobailon/pi-subagents/blob/0fc0eebb9604970c506708b7508d6aa38921fde2/docs/extension-api.md#L498-L506)）。
3. async completion 只属于 originating session；`pi.events` 只在同一进程内，不能跨 Pi process（[observability, lines 281–303](https://github.com/nicobailon/pi-subagents/blob/0fc0eebb9604970c506708b7508d6aa38921fde2/docs/observability.md#L281-L303)）。因此“run 最终完成”和“用户收到通知”必须是两个状态，不能共用一个布尔。
4. background lifecycle artifacts（`status.json`、`events.jsonl`、log）可供恢复观察；但 result file 在 completion delivery 后会被消费删除，replay/archive 只是有 TTL 的 best-effort 临时状态，不是永久 ledger（[observability, lines 166–193](https://github.com/nicobailon/pi-subagents/blob/0fc0eebb9604970c506708b7508d6aa38921fde2/docs/observability.md#L166-L193)）。

### 7. 通知/UI 的可靠性边界

1. Pi `ctx.ui.notify` 是 non-blocking UI 提示；只有 `tui` 和 `rpc` 的 `ctx.hasUI` 为 true，JSON 模式 UI methods 是 no-op，print 模式不能 prompt（[extensions, lines 2922–2937](https://github.com/earendil-works/pi/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/coding-agent/docs/extensions.md#L2922-L2937)）。
2. RPC 中 `notify` 只是 fire-and-forget `extension_ui_request`，client **可以显示，也可以忽略**（[RPC docs, lines 1184–1205](https://github.com/earendil-works/pi/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/coding-agent/docs/rpc.md#L1184-L1205)）。不存在 delivery acknowledgment。
3. 当前 `vibi-yt` Commands 只在 `ctx.hasUI` 时 `notify` Action result（[`adapters/pi/index.ts`, lines 30–59](https://github.com/fookhsu/vibi-yt/blob/af2cb5f56366162808e3f9d7e4b689e81d8501fd/adapters/pi/index.ts#L30-L59)）。未来若要求 headless/manual invocation 可观察，结果不能只存在于 `notify`，必须同时写 durable run/artifact 或由调用入口返回 structured result。
4. OS toast 需要终端协议/外部程序；官方 `notify.ts` 示例正是扩展自行发 OSC 或调用 PowerShell，然后在 `agent_settled` 触发（[example, lines 26–56](https://github.com/earendil-works/pi/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/coding-agent/examples/extensions/notify.ts#L26-L56)）。这不是 Pi 承诺所有终端都会送达。

### 8. “offline”有两种含义，不能混用

- **Host offline / Pi process 不存在：**没有 extension runtime，也没有 timer 或 UI receiver；只能在下次启动恢复、或由外部 launcher 唤起。
- **Pi `--offline` / `PI_OFFLINE=1`：**官方定义只关闭 startup network operations（update checks、package checks、telemetry），并不承诺拦截 extension 自己的 YouTube HTTP 请求（[Pi README, lines 671–684](https://github.com/earendil-works/pi/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/coding-agent/README.md#L671-L684)）。

所以 Digest 状态不能把 `PI_OFFLINE` 解释为“排队等待网络恢复”；YouTube 请求失败仍应按 `network_or_upstream_error` 进入 run failure/retry policy，而不能提前标成成功。

### 9. Artifact 与用户配置存储

#### Pi core 提供什么

- 扩展进程有完整文件系统权限，可以自行创建目录并写文件；Pi core 没有 `registerArtifact()` 或 durable delivery API。
- `appendEntry` 只把 extension custom data 放入当前 session JSONL，而且 session 文件本身可以被用户删除（[session file/delete, lines 1–17](https://github.com/earendil-works/pi/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/coding-agent/docs/session-format.md#L1-L17)；[CustomEntry, lines 263–269](https://github.com/earendil-works/pi/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/coding-agent/docs/session-format.md#L263-L269)）。它适合 session UI state，不适合全局 Interest / 90 天去重历史。
- Pi settings 是 global `~/.pi/agent/settings.json` 加 project `.pi/settings.json`；project resource 是否加载还受 trust 约束（[settings, lines 1–22](https://github.com/earendil-works/pi/blob/d981de1229ef899957bbe968bc8dcda02a21f477/packages/coding-agent/docs/settings.md#L1-L22)）。Pi 没有替 `vibi-yt` 自动 merge/validate 独立 schema 的能力。

#### `vibi-yt` 应 own 什么

当前 package 已经用 `<agentDir>/vibi-auth.json` 和 `<agentDir>/vibi-oauth-token.json`，并让 `PI_CODING_AGENT_DIR` 搬迁这些文件（[`README.md`, lines 39–50, 64–73](https://github.com/fookhsu/vibi-yt/blob/af2cb5f56366162808e3f9d7e4b689e81d8501fd/README.md#L39-L50)）。同样的 adapter-injected path 模式可以承载用户级 Interest/history，但配置 schema、locking、atomic write、permissions、migration 都必须由 `vibi-yt` 定义。

Markdown/JSON Digest 也应是一个 core generation 的两种 deterministic serialization，共享同一 `digestId` 和 manifest/ledger。只有在两份 artifact 都落盘并校验后，run 才能进入 `succeeded`。Pi 当前 `.pi/tmp/vibi-artifacts` 是 Tool Spill 路径（[`adapters/pi/index.ts`, lines 25–28, 71–80](https://github.com/fookhsu/vibi-yt/blob/af2cb5f56366162808e3f9d7e4b689e81d8501fd/adapters/pi/index.ts#L25-L28)），不应默认升级为 durable Digest 历史目录。

#### 不要把 `pi-subagents` debug artifacts 当产品存储

`pi-subagents` 的 artifactDir 默认在 session 目录，可能回落 OS temp，并会被 age-based cleanup；临时 workflow artifacts 24 小时后清理（[configuration, lines 502–518](https://github.com/nicobailon/pi-subagents/blob/0fc0eebb9604970c506708b7508d6aa38921fde2/docs/configuration.md#L502-L518)）。显式 child `output` 可以得到 durable file reference（[tool reference, lines 162–170](https://github.com/nicobailon/pi-subagents/blob/0fc0eebb9604970c506708b7508d6aa38921fde2/docs/tool-reference.md#L162-L170)），但那仍是可选 orchestration binding；Digest 的 canonical Markdown/JSON 应由 `vibi-yt` 自己拥有。

## 可依赖 / 不可依赖

### `vibi-yt` 可以直接依赖

1. Pi 0.85.1 的 Tool、Command、lifecycle、`ctx.mode/hasUI`、`notify`、session metadata 等公开类型。
2. `session_start` 恢复 package 自己的用户配置；`session_shutdown` 清理当前 runtime 的 timer/watcher/loopback。
3. Command 直接调用 Host-neutral Action，完成手动立即生成。
4. Node 文件系统写入 package-owned path；同一次 run 原子提交 JSON、Markdown 和 run ledger。
5. UI 提示只作为 best-effort projection，不作为完成证据。
6. `agent_settled` 用于“当前 agent loop 真正静止”的 UI integration，但 Digest 业务完成应以自己的 run ledger/artifact commit 为准。

### `vibi-yt` 不可直接依赖

1. Pi core 存在 schedule/cron、background bash、daemon 或 missed-run replay。
2. 关闭 Pi 后 extension timer 仍运行。
3. `PI_OFFLINE` 会缓存/排队 YouTube 请求。
4. `ctx.ui.notify` 是 OS notification，或 RPC client 一定显示/ack 它。
5. session custom entry 是跨 session 的用户配置或 durable job ledger。
6. `pi-subagents` 一定安装；当前 `vibi-yt` package 只把 Pi packages 列为 peer，runtime dependency 只有 `youtube-transcript-plus`，没有 `pi-subagents`（[`package.json`, lines 52–75](https://github.com/fookhsu/vibi-yt/blob/af2cb5f56366162808e3f9d7e4b689e81d8501fd/package.json#L52-L75)）。
7. `pi-subagents` schedule 是 cron/calendar；它目前只有 fixed interval/one-shot。
8. `pi-subagents` 的 result/replay/debug artifact 永久保存。
9. model-facing `subagent({ action: "schedule.run-due" })` 等价于稳定的无模型 CLI/API。

### 仅在显式可选集成中可依赖

若后续决定支持 `pi-subagents >=0.66.0` integration，必须在安装检查/版本检查成功后才能依赖：

- schedule record 与 history；
- one-shot / fixed interval；
- `overlap: skip`；
- `catchUp: latest | none`；
- fresh async child；
- originating session 仍活着时的 completion wake；
- schedule output 通过显式 `output` 指向 `vibi-yt` own durable path。

不能透过未导出的 `src/runs/background/scheduled-runs.ts` internal import；需要 package 提供公开 API，或把 integration 留给用户/launcher。

## 对状态机的约束

后续规格至少应把以下状态分开；否则会再次把 scheduler、execution、artifact 与 delivery 混在一起。

### 1. Schedule definition 与 run 必须分离

```text
Schedule: enabled | paused | deleted
Run:      claimed -> running -> succeeded
                    |          -> failed
                    -> skipped_overlap
                    -> missed
```

- Schedule 记录 recurrence policy；Run 记录一次 `plannedAt` 的尝试。
- 唯一工作键建议为 `(scheduleId, plannedAt)`；手动 run 使用独立 `runId` 与 `origin: manual`。
- 对每个 slot 做 atomic claim；launcher retry、Pi restart 或两个 Host 同时醒来时不能重复生成同一 Digest。

### 2. 明确定义 trigger origin

至少区分：

```text
manual | in_process_timer | external_launcher | catch_up
```

所有 origin 最终必须调用同一个 Host-neutral generation service；timer/Command/launcher 只做 trigger translation，不能各自复制候选、排序或 artifact 逻辑。

### 3. Catch-up 是产品策略，不是 Pi 默认

- 若选 `none`：恢复时记录 missed，不补跑。
- 若选 `latest`：无论漏了多少 slot，最多补一个最新 slot，然后把 `nextPlannedAt` 推到未来。
- 不要默认 replay all；既可能产生重复内容，也会冲击 YouTube quota。
- catch-up 运行的 `plannedAt`、实际 `startedAt` 与 `generatedAt` 必须分别保存，解释“这份 Digest 属于哪一期”。

### 4. Overlap 首版必须 fail closed

若沿用已调查到的安全边界，首版只允许 `skip`：前一 run 仍 active 时，新 slot 写 `skipped_overlap`，不 queue、不 replace、不杀死旧 run。若产品以后要 queue/replace，那是新决策和新并发协议，不能借用 Pi tool-call concurrency 的语义。

### 5. Artifact commit 才是成功边界

```text
generated in memory
  -> JSON temp written + validated
  -> Markdown temp written
  -> both renamed/manifest committed
  -> history/dedupe committed
  -> run = succeeded
  -> notification attempt
```

- `succeeded` 必须指 canonical JSON + Markdown 均可读，而不是“模型/YouTube 调用结束”或“notify 被调用”。
- partial files 留作 failed-run diagnostics 或安全清理，但不能进入 latest pointer。
- JSON 应包含 schema version、`digestId`、run identity、Interest snapshot/version、planned/generated timestamps、lane records 和解释字段；Markdown 从同一 domain result 渲染。

### 6. Notification 是独立 best-effort delivery

```text
run.succeeded
notification: not_attempted -> attempted -> displayed_unknown | failed
```

Pi TUI notify 没有 ack；RPC client 可忽略；session shutdown 会丢 completion wake。因此最多记录“attempted”，不能记录“delivered”或用它决定是否重跑 Digest。用户重新打开 Pi 时应能从 durable latest/history 看到未读/最近结果，而不是依赖旧 toast。

### 7. Storage scope 必须显式

- 用户级 Interest、Feedback、90 天 dedupe/history：package-owned user store（Pi adapter 可从 `getAgentDir()` 注入）。
- 项目级 override 若未来需要：放 `CONFIG_DIR_NAME` 下并只在 trusted project 使用。
- session entry：仅用于当前会话 projection/cursor，不是 source of truth。
- schedule metadata：若复用第三方 scheduler，只保存其 trigger/receipt reference；Digest 的配置和产物仍在 `vibi-yt` store。

### 8. Crash/restart recovery 必须基于 ledger，而非 timer 内存

启动时：

1. 读 package-owned schedule/run ledger；
2. 对过期 `running` lease 做有界、可证明的 recovery；
3. 依据 `catchUp` 计算最多一个 due slot；
4. 重新 arm 进程内 timer（如果启用）；
5. 外部 launcher 也调用同一 `runDue()`，以 atomic claim 去重。

不能用“session 又触发了 `session_start`”本身证明旧 run 失败，也不能因 PID 不存在就无条件接管仍可能写文件的 orphan process。

## 后续决策输入

以下不是本票替地图作决定，而是后续规格必须明确选择的输入：

1. **调度 ownership**：
   - A. `vibi-yt` 只提供 `run-now` / `run-due` 稳定入口，由外部 launcher 负责 wall clock；
   - B. 另做显式 `pi-subagents` 可选 adapter；
   - C. 两者都支持，但共享同一 atomic run ledger。
2. **首版 wall-clock 承诺**：仅“Pi 在线时尽力”，还是“机器在线但 Pi 未打开也会运行”。后者必然要求外部 launcher/service。
3. **recurrence 表达**：fixed interval 是否够用；“每天 08:00 本地时间”需要 timezone/calendar/DST 规则，当前 `pi-subagents` 不能表达。
4. **catch-up**：建议在 quota 敏感场景明确选择 `latest` 或 `none`；不要隐含 replay-all。
5. **overlap**：首版是否正式固定 `skip`；如果是，要定义用户能看到的 skipped receipt。
6. **headless API**：是否新增无模型 CLI/SDK Action（例如 `vibi-yt digest run-due --json`）。这是 cron/systemd/launchd 稳定集成的前提。
7. **artifact retention**：用户级路径、保留数量/天数、`latest` pointer、JSON schema version、权限和清理规则。
8. **notification UX**：Pi TUI 提示是否足够；地图已把 email/Telegram/Discord/Webhook 排除，则不要把 OS toast 当可靠投递承诺。
9. **optional Host model**：若 Digest ranking 使用 Host model，scheduled fresh run 如何选择 model、无 model/auth 时如何退化；这属于后续模型能力票，不改变本报告的 scheduler 边界。
10. **dependency policy**：如果真的依赖 `pi-subagents`，要确定最低/固定版本、缺失时行为、功能探测和公开 API；不能只因开发者机器当前安装了 0.66.0 就宣称所有 `vibi-yt` 用户拥有 schedule。

## 给地图 #16 的一句话 resolution

**把 Digest generation、durable state/artifacts 做进 `vibi-yt` core；把“立即生成”做成 Action/Command；把 wall-clock trigger 留给显式外部 launcher，进程内 Pi timer 只作在线优化。`pi-subagents` 0.66.0 的 schedule 是可选宿主扩展能力，不是 Pi core，也不是 `vibi-yt` 可默认依赖的基础设施。**
