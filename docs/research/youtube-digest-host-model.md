# YouTube Digest：使用当前 Host 模型评价候选的受支持路径

> 对应 [R3 · issue #19](https://github.com/fookhsu/vibi-yt/issues/19)，为 [Digest map · issue #16](https://github.com/fookhsu/vibi-yt/issues/16) 提供一手事实。

## 结论

Pi **有受支持的当前模型调用路径，但没有一个“一步完成、跨 provider 强制结构化、同时自带候选/费用硬预算”的 Digest evaluator API**。

- 扩展 handler 的 `ExtensionContext` 暴露当前选中模型 `ctx.model`、共享认证/模型入口 `ctx.modelRegistry` 和活动 turn 的取消信号 `ctx.signal`；公开的 `ModelRegistry.complete(model, context, options)` 会通过 Pi 的 `ModelRuntime` 完成请求。因此，在 **Pi adapter 的编排层**用 `ctx.modelRegistry.complete(ctx.model, ...)` 请求当前 Host 模型，是受支持契约，不是挖内部字段。[类型声明：context][ext-context] [类型/源码：`complete`][model-registry]
- 该组合调用可以用 `maxTokens` 限输出、用 `signal`（以及 provider/SDK 支持时的 `timeoutMs`）限时间、用 `maxRetries` 限 provider 重试；候选数、字幕总字符数和“最多一次评价请求”仍须由 vibi 在调用前硬限。Pi 只在响应后给出 `usage`，没有“本次最多花多少钱/最多总 token（输入+输出）”的原子预算参数。[pi-ai 请求选项][request-options] [响应 usage 类型][assistant-result]
- 结构化结果可表达为一个 JSON Schema tool；`constrainedSampling: { type: "json_schema", strict: "require" }` 在不能严格执行的模型上会让请求失败，而 `strict: "prefer"` 会退化为普通 tool calling。它约束的是**被调用 tool 的参数**，不是跨 provider 强制模型一定选择该 tool。[官方契约][strict-doc] [类型声明][tool-context]
- provider-neutral 的 `ToolChoice` 目前只有 `"auto" | "none"`；`ModelRegistry.complete` 接受各 API 自己的完整 options。因此“强制调用指定结果 tool”没有统一的当前-模型契约；若要求跨 Host/跨 provider 的确定结构，应把它列为额外 Host capability，或把“未返回唯一合法 tool call”作为评价失败并回退元数据排序。[类型声明][tool-choice]
- Tool handler **技术上能**拿到同一 `ExtensionContext` 并发起嵌套模型请求；Pi 文档甚至规定嵌套 LLM 的 `usage` 应回填到 tool result。但 vibi 不应这么做：它会把 YouTube Capability Tool 变成 Host-aware evaluator，违反现有 Tool / Action / Adapter seam，并在外层模型等待 Tool 时增加一个不可见的 provider 请求。[Tool 定义与计费][nested-usage] [vibi seam][vibi-types]

**推荐 seam：** 保持现有四个 `youtube_*` Tool 只做召回；在未来 Digest application service 接受一个显式注入的、可选的 `CandidateEvaluator`。Pi adapter 在用户命令/受控编排入口取得当下的 `ctx.model`，以 `ctx.modelRegistry.complete` 实现 evaluator；无模型、超时、非唯一/不合法 tool call、`strict: "require"` 不受支持或请求失败时，按 map 已定方向退回元数据排序。不要把模型或 `ModelRegistry` 加进 `ToolContext`，也不要让任一 `youtube_*` handler 调模型。

## 检查基线

- 仓库：`fookhsu/vibi-yt`，基线 commit [`af2cb5f`](https://github.com/fookhsu/vibi-yt/tree/af2cb5f56366162808e3f9d7e4b689e81d8501fd)。
- 已安装并核对：`@earendil-works/pi-coding-agent` **0.85.1**、`@earendil-works/pi-ai` **0.85.1**、Node floor `>=22.19.0`；官方 tag [`v0.85.1`](https://github.com/earendil-works/pi/tree/v0.85.1) 指向 commit [`d981de1`](https://github.com/earendil-works/pi/commit/d981de1229ef899957bbe968bc8dcda02a21f477)。
- 完整阅读：Pi `README.md`、`docs/sdk.md`、`docs/extensions.md`；并交叉检查 pi-ai `README.md`、公开类型声明、`ModelRegistry` / `ModelRuntime` / `AgentSession` / SDK 装配源码以及官方 extension examples。
- 本报告不重复研究调度生命周期或 YouTube API。

## 1. 什么是支持契约，什么只是当前实现

| 事实 | 归类 | 证据与含义 |
| --- | --- | --- |
| `ExtensionContext` 有 `modelRegistry`、可空的当前 `model`、`thinkingLevel` 和可空 `signal` | **公开支持契约** | 源码类型明确导出；文档说明 `ctx.model` 是 active model，`ctx.signal` 可交给 model calls。[类型][ext-context] [文档][ctx-doc] |
| `ModelRegistry.complete<TApi>(model, context, options)` 是公开方法 | **公开支持契约** | `ModelRegistry` 是 ExtensionContext 的公开类型；方法接收 pi-ai `Context` 与 `ModelsApiStreamOptions`。[源码][model-registry] |
| 官方 `handoff` / `qna` examples 使用 `ctx.modelRegistry.complete(ctx.model, ...)` | **一手支持范例** | `handoff` 用当前模型、独立 system prompt、取消信号和独立 session id；不是私有成员访问。[handoff example][handoff] |
| `complete` 当前直接委托给同一个 `ModelRuntime.complete` | **0.85.1 实现事实，不应成为 vibi 契约** | 可说明认证/provider 路由来自 Host；vibi 不应依赖“恰好只是一行委托”的实现形状。[源码][model-registry] |
| 普通 Agent turn 的 provider hooks、Host retry/timeout defaults 由 `AgentSession` 创建时的 wrapper 另行装配 | **0.85.1 实现事实** | SDK 装配给正常 agent stream 注入 settings、headers、`before_provider_*` / `after_provider_response`。直接 `ModelRegistry.complete` 的公开契约没有承诺重放整套 AgentSession 生命周期；调用方应显式传自己的限额并且不要假设会产生普通 turn/session 事件。[SDK 装配源码][sdk-wiring] |
| `ExtensionAPI` 本身没有 `complete/evaluate` 方法；调用入口在 handler 的 context 上 | **公开支持契约** | `ExtensionAPI` 列出注册、消息、tool、model selection 等方法；模型 completion 位于 `ctx.modelRegistry`，不是 `pi.complete()`。[ExtensionAPI 类型][extension-api] |

这一区分很重要：`ctx.modelRegistry.complete` 本身可用；“它会像主 Agent turn 一样自动执行 tools、持久化消息、重试、compact、发出所有 lifecycle event”则**没有**这样的契约。

## 2. 直接评价调用能保证什么

### 2.1 当前模型与认证

安全入口是：

1. handler 读取当次 `ctx.model`；它可能为 `undefined`，必须视为可选增强不可用；
2. 调用同一个 context 的 `ctx.modelRegistry.complete(ctx.model, isolatedContext, options)`；
3. 检查 `AssistantMessage.stopReason`，只接受成功且唯一合法的评价结果；
4. 记录返回的 `usage`，但不能把它误当请求前预算。

官方 `handoff` example 正是读取 `ctx.model` 后使用 `ctx.modelRegistry.complete`；官方 custom compaction example 还展示了 `maxTokens`、`signal`、`cacheRetention: "none"`、独立 `sessionId` 以及把 `response.usage` 纳入结果。[handoff][handoff] [custom compaction][custom-compaction]

### 2.2 有界调用

Pi/pi-ai 0.85.1 可提供的控制：

- **候选数/输入大小：** 不由模型 API 提供。vibi 必须先截到固定候选数，并给每条字幕固定字符/token 预算；不能把 spill 全文无界塞入 evaluator。
- **输出：** `maxTokens` 是公开 `StreamOptions` 字段。[类型][request-options]
- **取消/时限：** `signal`、`timeoutMs` 是公开 request options；活动 tool/event 中 `ctx.signal` 可用，idle command 中通常没有，需自建 `AbortSignal.timeout(...)` 并与用户取消组合。[类型][request-options] [扩展文档][ctx-doc]
- **provider 重试：** `maxRetries` 与 `maxRetryDelayMs` 可显式限制。[类型][request-options]
- **费用：** `AssistantMessage.usage` 是事后计量；没有 preflight cost ceiling。若“硬上限”指总费用，最小可靠策略是固定一次请求、固定输入、固定 `maxTokens`，而不是依赖事后 usage。

### 2.3 结构化但不是无条件强制

pi-ai 的 `Context` 可以携带 `tools`，每个 tool 有 JSON Schema 和可选 constrained sampling；响应中的 `toolCall.arguments` 才是候选结构化结果。[类型][tool-context] 官方 README 说明：

- `strict: "require"`：Host/model 不能执行严格 JSON Schema 时请求失败；
- `strict: "prefer"`：不支持时退回普通 tool calling；
- 严格能力覆盖若干 provider/model 组合，而不是所有当前模型。[官方说明][strict-doc]

仍有两个边界：

1. provider-neutral `toolChoice` 没有 `"required"` 或“指定 tool”值，只有 `auto/none`；各 provider 的强制形式不同。[类型][tool-choice]
2. pi-ai 的低层 `complete` 只返回 assistant message；如果模型给 tool call，调用方必须识别、验证和处理，官方 quick start 也显式手写了 tool-call loop，而不是由 `complete` 自动执行。[官方 quick start][manual-loop]

所以对 evaluator 最稳妥的 0.85.1 约定是：给独立 Context 只放一个**无副作用的结果 schema tool**，prompt 要求只调用它；adapter 验证“恰好一个该 tool call + 参数合法 + stopReason 合理”，否则整次语义增强失败并回退。不要把 YouTube 召回 tools 一并放入这个 nested Context，否则 adapter 就要重新实现 agent loop，且可能再次召回或递归。

## 3. 受支持的编排形状

| 形状 | 一手支持路径 | 副作用/限制 | 可移植性 | 最小 Host capability |
| --- | --- | --- | --- | --- |
| **A. 主 Agent 主动多步：召回 Tool → 同一模型评价 → 输出 Digest** | Pi lifecycle 明确一个 turn 可反复进行 LLM→tool→下一 LLM；Tool 是 LLM-callable。[生命周期][agent-loop] | 评价发生在可见主会话；模型可调用所有 active tools；轮数/总费用不由 vibi 单次 API 原子限制。最终可用 terminating structured-output tool 跳过多余 follow-up。[结构化终止例][structured-output] | **最高**；正是现有 Host 的基本 agent/tool 模式 | JSON Schema tools；把 tool result 返回模型；在 tool use 后继续模型 turn；可选最终结构化 tool |
| **B. 用户 Command 向当前 session 注入受控 prompt** | `pi.sendUserMessage` 发送真实 user message并总会触发 turn；streaming 时必须选择 steer/followUp。[文档][send-user-message] | prompt 和结果进入当前 session；走主 Agent 正常 hooks/重试/工具循环；`ExtensionAPI.sendUserMessage` 返回 `void`，command 不能把它当同步 evaluator 返回值。 | Pi 特有 API，但概念可移植到“Host 可启动 agent run” | 启动/排队一个正常 agent run；当前模型；tool allowlist 或等价政策最好可控 |
| **C. 用户 Command 新建 session 后发送 kickoff** | 只有 `ExtensionCommandContext` 有 `newSession`，`withSession` 提供绑定新 session 的 `sendUserMessage`。[文档][new-session] | 替换用户当前 session，触发 shutdown/reload/start；旧 ctx 立即失效。隔离历史较好，但 UX 和状态切换代价最大，不适合作为隐形 evaluator。 | session-capable Hosts 可仿照，非通用 | 创建隔离 session、绑定当前模型/凭据、限制 tools、等待完成、读取结果 |
| **D. Adapter 注入 evaluator，内部一次 `ModelRegistry.complete`** | `ctx.model` + 公开 `ModelRegistry.complete`；官方 examples 已采用。[类型/源码][model-registry] [例子][handoff] | 额外 provider 请求；不自动入主 session、不自动执行 tool calls；必须显式限额、取消、校验 stopReason/结构、记 usage；不能假设 AgentSession hooks。 | Pi 实现明确；抽象为小 evaluator port 后可跨 Host | 当前模型句柄、认证后的 one-shot completion、JSON Schema tool、输出/时间限制、取消、usage；若要求强结构，还需“强制指定 schema/tool”能力 |
| **E. SDK/RPC 外部编排** | SDK 的 `createAgentSession`/`session.prompt` 和 tool allowlist 是公开 API；RPC 是语言无关替代。[SDK][sdk-session] [tools][sdk-tools] | 新 runtime/session 的模型、认证、资源、日志和清理都由调用方拥有；它不是自动复用当前交互 session 的零成本捷径。 | SDK 为 Node；RPC 跨语言 | 能创建隔离 agent run、选模型/凭据、限定 tools、订阅完成/usage |

### 推荐顺序

1. **按需、用户可见 Digest：优先 A/B。** Command 只负责构造一个有硬候选上限的任务 prompt；让主 Agent 用已有 `youtube_search` / `youtube_video_details` / `youtube_transcript` 做召回并自行评价，最后调用一个 Digest schema tool。这样没有 nested model call，也保留 Pi 的正常 tool loop、session 可见性和 Host hooks。
2. **需要 core 得到 typed evaluation 后再做确定性排序/Markdown+JSON：使用 D。** 新建 Host-neutral `CandidateEvaluator` 注入 Digest application service；Pi adapter 的 command handler 在执行时构造实现。一次评价请求只看已经硬限额的小批候选，不给它召回 tools，返回 validated data 或失败。
3. **C/E 只在确实需要隔离 session/无人值守边界时采用。** 它们不是为了绕过 evaluator seam。

## 4. 对 vibi seam 的具体约束

当前项目已经规定：

- Tool 是“Capability 暴露给模型”的 JSON Schema + handler；Action 是用户触发；Adapter 只做 Host 翻译。[词汇表][vibi-context]
- `tools/`、`lib/` 不得 import agent SDK；`ToolContext` 只有 agent/artifact 目录、取消和可注入 transport，没有模型端口。[导入约束][vibi-types] [ToolContext][vibi-tool-context]
- Pi adapter 当前只把 core registry 投影到 `pi.registerTool`，将 `signal`/路径传给 core，再渲染结果。[adapter][vibi-adapter]

因此建议 future architecture ticket 使用下面的职责边界（示意，不是本票实现）：

```text
Digest command / scheduler trigger
  -> Digest application service
       -> YouTube capability ports（召回；现有 Tool 所包装的 core capability）
       -> CandidateEvaluator?（可选、显式注入；一次、有界、纯评价）
       -> deterministic policy（阈值、去重、lane、最多 10 条）
       -> Markdown + JSON

Pi CandidateEvaluator
  -> 在入口时捕获本次 ctx.model
  -> ctx.modelRegistry.complete(model, isolated context, hard limits)
  -> 验证唯一 evaluation_result tool call
  -> typed result | unavailable/failure + usage
```

`CandidateEvaluator` 不应进入 `ToolContext`，也不应由 `youtube_search` / `youtube_transcript` 等 handler 调用。它属于 Digest application orchestration 的可选依赖。这样其他 Host 最少只需实现下列 capability；缺任一项即可明确走 metadata fallback：

1. 提供当前选中模型或明确“不可用”；
2. 使用 Host 自己已配置的认证发一次 completion，不要求用户提供第二套模型 key；
3. 接受隔离的 system/user context 和 JSON Schema result tool；
4. 支持候选输入上限、`maxTokens`、deadline/cancel、最多请求次数；
5. 返回 stop reason、usage 和 tool-call arguments；
6. 若产品要求强结构，声明是否支持“强制指定结果 schema/tool”；不能支持时 fail closed，不解析自由文本冒充结构化评价。

## 5. Tool handler 内再次触发模型：能，但排除

Pi 的 `ToolDefinition.execute(..., ctx)` 确实接收完整 `ExtensionContext`，所以从纯 API 能力上，handler 可调用 `ctx.modelRegistry.complete`。[类型][ext-context] 官方 extensions 文档还明确说：Tool 若做 nested LLM call，应把合计 `Usage` 放到 tool result，Pi 会持久化并纳入 footer、`/session`、RPC totals。[文档][nested-usage]

但对 vibi 路线应排除，原因不是“Pi 会无限递归”——一次 `complete` **不会自动执行 nested tool call**——而是：

- 外层 Agent 正在等待 Tool；期间再发一个模型请求，用户看到一个 Tool 调用却实际付了两层模型费用；
- nested completion 不自动拥有主 Agent 的 tool loop/session persistence/compaction/retry 语义；
- 将 Host 模型塞入 core Tool 破坏 `tools/` / `lib/` 的 agent-neutral 规则；
- 若 nested Context 又暴露同一个 YouTube Tool 或自行循环 tool call，才会引入真正的递归/重复召回风险；完全没有必要。

## 6. 被排除路线

1. **从 core import Pi SDK 或把 `ModelRegistry` 加入 `ToolContext`。** 直接违反当前源码约束与 ADR 0002；会使第二 Host 无法只实现现有 Tool/Action mappings。[vibi types][vibi-types] [ADR][adr-0002]
2. **使用 `pi.sendUserMessage` 作为同步 evaluator RPC。** 它触发正常 agent turn，但 `ExtensionAPI` 签名返回 `void`；适合 B，不适合等待一个 typed result。[类型][extension-api]
3. **依赖自由文本 JSON。** 没有 schema enforcement；截断、markdown fence、额外 prose 都会让解析不可靠。唯一合法 tool call 或显式 structured Host capability 才算结构化。
4. **假设 `strict: "prefer"` 等于硬保证。** 官方定义就是“不支持则 fallback”；要求硬保证必须用 `require` 并接受 capability failure。[官方说明][strict-doc]
5. **硬编码 provider-specific `toolChoice`。** 当前模型可来自不同 API；provider-neutral choice 没有 required/named tool。除非 Host capability 先声明并适配，否则不属于可移植 seam。[类型][tool-choice]
6. **直接调用 provider HTTP、读取 Host key，或使用旧 `@earendil-works/pi-ai/compat` 全局 API。** `ModelRegistry.complete` 已经提供 Host 认证与 provider 路由；绕开它扩大凭据面，并放弃“当前 Host 模型”的含义。
7. **在 `before_provider_request` 篡改主请求来夹带 evaluator。** 官方把该 hook定位为 provider payload 检查/替换；它没有独立结果、预算或 failure boundary，并会耦合 wire payload。[扩展文档：provider hook][provider-hook]
8. **从 Tool/event 调 session replacement。** Pi 只在 `ExtensionCommandContext` 暴露这些方法，文档明确原因是 event handler 调用可能 deadlock。[命令 context][new-session]

## 7. 给后续架构票的可直接采用决策

- **支持路径存在：** Pi 0.85.1 的 adapter 可以用 `ctx.modelRegistry.complete(ctx.model, ...)` 调当前 Host 模型。
- **不是 core Tool 能力：** 模型评价属于 Digest orchestration 的可选 `CandidateEvaluator`，不是第五个 YouTube Capability，也不进入现有 Tool handler。
- **结构化策略：** 单个无副作用 `evaluation_result` JSON Schema tool；能用 `strict: "require"` 时使用；任何非唯一/不合法/自由文本结果都 fail closed，回退 metadata。
- **硬预算必须组合：** 预先硬限候选和每条文本；每次 Digest 最多一次评价 completion；设置 `maxTokens`、deadline、`maxRetries`；事后记录 usage。Pi 没有单参数总费用 ceiling。
- **首选交互路径：** 让主 Agent 正常多步调用现有 YouTube Tools 并评价；只有当 deterministic Digest service 必须拿到 typed scores 时才走注入 evaluator 的一次 direct completion。
- **禁止递归：** evaluator 的 isolated Context 不暴露 YouTube Tools；它只允许终端结果 schema，adapter 只验证 tool call 参数，不执行 nested tools。

[ext-context]: https://github.com/earendil-works/pi/blob/v0.85.1/packages/coding-agent/src/core/extensions/types.ts#L310-L336
[model-registry]: https://github.com/earendil-works/pi/blob/v0.85.1/packages/coding-agent/src/core/model-registry.ts#L28-L109
[request-options]: https://github.com/earendil-works/pi/blob/v0.85.1/packages/ai/src/types.ts#L123-L205
[assistant-result]: https://github.com/earendil-works/pi/blob/v0.85.1/packages/ai/src/types.ts#L373-L449
[strict-doc]: https://github.com/earendil-works/pi/blob/v0.85.1/packages/ai/README.md#L493-L509
[tool-context]: https://github.com/earendil-works/pi/blob/v0.85.1/packages/ai/src/types.ts#L495-L528
[tool-choice]: https://github.com/earendil-works/pi/blob/v0.85.1/packages/ai/src/types.ts#L82-L83
[nested-usage]: https://github.com/earendil-works/pi/blob/v0.85.1/packages/coding-agent/docs/extensions.md#L1983-L2019
[vibi-types]: https://github.com/fookhsu/vibi-yt/blob/af2cb5f56366162808e3f9d7e4b689e81d8501fd/tools/types.ts#L1-L10
[vibi-tool-context]: https://github.com/fookhsu/vibi-yt/blob/af2cb5f56366162808e3f9d7e4b689e81d8501fd/tools/types.ts#L110-L160
[ctx-doc]: https://github.com/earendil-works/pi/blob/v0.85.1/packages/coding-agent/docs/extensions.md#L1013-L1029
[handoff]: https://github.com/earendil-works/pi/blob/v0.85.1/packages/coding-agent/examples/extensions/handoff.ts#L114-L149
[custom-compaction]: https://github.com/earendil-works/pi/blob/v0.85.1/packages/coding-agent/examples/extensions/custom-compaction.ts#L77-L108
[sdk-wiring]: https://github.com/earendil-works/pi/blob/v0.85.1/packages/coding-agent/src/core/sdk.ts#L305-L365
[extension-api]: https://github.com/earendil-works/pi/blob/v0.85.1/packages/coding-agent/src/core/extensions/types.ts#L1248-L1428
[manual-loop]: https://github.com/earendil-works/pi/blob/v0.85.1/packages/ai/README.md#L185-L224
[agent-loop]: https://github.com/earendil-works/pi/blob/v0.85.1/packages/coding-agent/docs/extensions.md#L275-L314
[structured-output]: https://github.com/earendil-works/pi/blob/v0.85.1/packages/coding-agent/examples/extensions/structured-output.ts#L18-L64
[send-user-message]: https://github.com/earendil-works/pi/blob/v0.85.1/packages/coding-agent/docs/extensions.md#L1439-L1469
[new-session]: https://github.com/earendil-works/pi/blob/v0.85.1/packages/coding-agent/docs/extensions.md#L1109-L1170
[sdk-session]: https://github.com/earendil-works/pi/blob/v0.85.1/packages/coding-agent/docs/sdk.md#L42-L100
[sdk-tools]: https://github.com/earendil-works/pi/blob/v0.85.1/packages/coding-agent/docs/sdk.md#L518-L611
[vibi-context]: https://github.com/fookhsu/vibi-yt/blob/af2cb5f56366162808e3f9d7e4b689e81d8501fd/CONTEXT.md#L73-L99
[vibi-adapter]: https://github.com/fookhsu/vibi-yt/blob/af2cb5f56366162808e3f9d7e4b689e81d8501fd/adapters/pi/index.ts#L62-L87
[adr-0002]: https://github.com/fookhsu/vibi-yt/blob/af2cb5f56366162808e3f9d7e4b689e81d8501fd/docs/adr/0002-two-seams-and-no-model-facing-text-from-the-core.md#L5-L20
[provider-hook]: https://github.com/earendil-works/pi/blob/v0.85.1/packages/coding-agent/docs/extensions.md#L702-L733
