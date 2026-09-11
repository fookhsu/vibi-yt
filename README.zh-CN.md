# vibi-yt

[English](README.md) | **简体中文**

给编码 agent 的 YouTube **只读**能力，对模型暴露为**工具**，对你暴露为**动作**。目前唯一的宿主是 Pi。

- `youtube_search` — 按关键词搜索视频
- `youtube_video_details` — 一个到十个视频的元数据与统计
- `youtube_transcript` — 一个到十个视频的字幕
- `youtube_subscriptions` — **你**订阅的频道（需要授权）

全部只读。无法订阅、评论或上传。

## 安装

需要 Node `>=22.19.0`（Pi 自身的下限）。

```bash
pi install npm:vibi-yt
# 或者
pi install git:github.com/fookhsu/vibi-yt
```

## 凭据

凭据**按能力**解析，两套彼此独立——另有一项能力两者都不需要：

| 能力 | 凭据 |
| --- | --- |
| `youtube_search`、`youtube_video_details` | API key |
| `youtube_subscriptions` | OAuth 授权 |
| `youtube_transcript` | 无需——见下文[字幕](#字幕transcript) |

两者之间**不会自动回退**：缺少 API key 时，不会悄悄用一个 OAuth token 顶上。

### API key

在一个启用了 **YouTube Data API v3** 的 Google Cloud 项目里创建 API key，然后二选一：

```bash
export YOUTUBE_API_KEY="..."
```

或在 Pi 里运行 `/youtube:set-api-key`。存储的 key 位于 `<agentDir>/vibi-auth.json`，权限 `0600`（`agentDir` 即 `getAgentDir()`，所以 `PI_CODING_AGENT_DIR` 可以搬走它）。

### OAuth（用于订阅）

1. 在 Google Cloud 创建一个 **OAuth 客户端**。两种类型都可以：
   - `installed`（桌面应用）：插件会绑定一个临时回环端口。
   - `web`：重定向地址必须与已登记的值**精确一致**。默认是 `http://localhost:6969`；用 `YOUTUBE_OAUTH_REDIRECT_URI` 覆盖。
2. 把下载到的客户端 JSON 放到某处，并让插件指向它：

   ```bash
   export YOUTUBE_OAUTH_CLIENT_JSON=/path/to/client_secret.json
   ```

   没有这个环境变量时，插件会找 `<agentDir>/vibi-oauth-client.json`。该文件**就地在原位读，不复制**。
3. 运行 `/youtube:authorize`。插件会打开浏览器，等待回环回调（最多两分钟）；如果回调到不了本进程，它会请你粘贴回调 URL。

token 写入 `<agentDir>/vibi-oauth-token.json`（权限 `0600`）。access token 会在到期前约一分钟自动刷新；refresh token **只有 Google 说 `invalid_grant` 才算失效**。

在无头或远程机器上，设置 `YOUTUBE_OAUTH_REFRESH_TOKEN`，而不必把 token 文件拷过去。它优先于 token 文件；第 1 步的客户端 JSON 仍然必需——刷新交换要用它。

安全说明：凭据值从不进入模型上下文、工具输出或会话日志。`/youtube:status` 只报来源与元数据，永不报值。

### 字幕（transcript）

`youtube_transcript` **完全不需要凭据**。它走的是 yt-dlp 用的那个非官方播放器端点，不是 Data API（见[配额与限制](#配额与限制)）。API key 只被用来查视频标题，以便给溢写文件命名；所以什么都没配置时字幕照样能取——只是溢写文件叫 `transcript-<videoId>.jsonl`，而不是 `<title>-<videoId>.jsonl`。

## 命令

| 命令 | 作用 |
| --- | --- |
| `/youtube:authorize` | 启动 OAuth 流程（回环 + 浏览器） |
| `/youtube:deauthorize` | 在 Google 侧撤销，然后删除本地 token |
| `/youtube:status` | 凭据来源与授权状态，不带任何值 |
| `/youtube:set-api-key` | 存储一个 API key |
| `/youtube:clear-api-key` | 删除已存储的 API key |

## 上下文预算

长内容不会被悄悄切掉：

- `detail: "full"` 的结果超过 **8,000 字符**时会落盘为 `<title>-<videoId>.jsonl` 工件（没有配置 API key 时标题退化为 `transcript`）。模型收到的是预览（开头与结尾各 2,000 字符的窗口）加路径，并用它自己的文件工具去读。没有任何内容被丢掉。
- `detail: "compact"` 的结果**永不落盘**，只返回预览窗口。
- 每个工具结果都把事实作为字段携带：`truncated`、`spilled`、`preview`、`records`。`truncated: true` 意味着模型没有收到全部内容，且它**无法**从溢写文件里取回。成功的溢写不是截断。

## 配额与限制

- **配额有限，而 `search` 是贵的那一个。** 一个 Google Cloud 项目默认每天有 10,000 个 YouTube Data API v3 单位，而 `search.list` 历来按每次 100 单位计——100 次搜索就是一天的预算。较新的项目可能改为把 `search.list` 限成它自己的每天 100 次调用桶。两种情况都一样：搜索要省着用。这不是批量爬虫。
- **字幕是弱点，而且不是偷懒。** Data API 确实有字幕接口，但 `captions.download` 需要对该视频的**编辑**权限——只能读回你自己拥有的视频的字幕——而 `captions.list` 只返回轨道元数据，永远不返回文本。既然没有取别人视频字幕的官方端点，`youtube_transcript` 就像 yt-dlp 一样去读字幕轨，也就一并继承了 YouTube 改动播放器或 timedtext 端点时的损坏。另外三项能力走的是有文档的 API，不受影响。
- **一次十个。** 搜索最多返回 10 条且不支持翻页；详情与字幕每次最多接受 10 个 ID。
- **不是每个视频都有字幕，也不是每种语言都在。** `youtube_transcript` 会返回 `transcript_unavailable`，并带上它确实找到的语言。

## vibi-yt 与 yt-dlp

[yt-dlp][yd] 是把媒体从 YouTube 里**取出来**的参考工具。vibi-yt 不下载任何东西，它的工作单位是一次工具调用，结果是落进模型上下文的数据——而不是磁盘上的一个文件。

两者不是竞品，而重叠区间值得直说：对大多数人真正想说的那句「帮我把这个视频拿来」，以及这四项能力之外的一切——播放列表、频道、评论、格式、直播聊天，或者一个不是 YouTube 的站点——工具都是 yt-dlp。输出是文件时用 yt-dlp；输出是工具结果时用 vibi-yt。

完整的正面对比，包括 yt-dlp 在哪里更强，在 [ADR 0004](docs/adr/0004-implement-the-capabilities-instead-of-shelling-out-to-yt-dlp.md)。

[yd]: https://github.com/yt-dlp/yt-dlp

## 环境变量

| 变量 | 用途 |
| --- | --- |
| `YOUTUBE_API_KEY` | API key（存储 key 的替代方式） |
| `YOUTUBE_OAUTH_CLIENT_JSON` | Google OAuth 客户端 JSON 的路径（支持 `~`） |
| `YOUTUBE_OAUTH_REFRESH_TOKEN` | 无头场景用的 refresh token（优先于 token 文件） |
| `YOUTUBE_OAUTH_REDIRECT_URI` | `web` 客户端登记的重定向地址 |

`PI_CODING_AGENT_DIR` 会搬走 agent 目录，因此也搬走全部三个凭据文件。

## 开发

没有构建步骤：包里就是 TypeScript，Pi 直接加载。

```bash
npm install
npm run typecheck
npm test
npm run ci        # typecheck + 测试 + pack 检查
pi -e .           # 直接从工作树里试
```

CI 会在 `engines` 下限（`22.19.0`）与 LTS 上跑 `npm run ci`，所以本地 `npm run ci` 通过是提 PR 的最低要求。

给任何东西命名之前先读 `CONTEXT.md`：那里的词汇是规范性的，一个在那里已有词的概念，不该以第二个名字出现。ADR 是约束，不是历史——ADR 0003 解释了为什么没有构建步骤，ADR 0002 解释了为什么 core 不返回给模型读的文本。需要新词时，先把它加进 `CONTEXT.md`。

## 发布

commit 标题是有承载力的：发布由 Conventional Commits 切出，`feat:` 抬 minor 并落在 **Added**，`fix:` 落在 **Fixed**，`docs:` 落在 **Documentation**，而 `chore:`、`ci:`、`test:`、`build:`、`style:` 不进 changelog。

版本策略、npm 的一次性配置与手动发布路径见 [docs/RELEASING.md](docs/RELEASING.md)。

## 许可

MIT。本项目延续 [eiei114/pi-youtube-tools](https://github.com/eiei114/pi-youtube-tools)（MIT）的血脉。
