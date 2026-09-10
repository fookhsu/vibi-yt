# vibi-yt

vibi-yt 把 YouTube 的**只读**能力以工具形式交给编码 agent，先做 Pi。这份文件只是词汇表：这里定义词，不定义实现（实现形态见 `.scratch/vibi/map.md`）。

## Language

### 凭据

**Credential source**:
插件取到调用权限的来源。解析是**按能力取**的：Subscription 只认 Authorization，其余 Capability 优先 API key。状态命令只报来源，永不报值。
_Avoid_: login, session, account

**API key**:
项目级的 YouTube Data API v3 密钥，来自环境变量或本地存储文件。能覆盖 search / video details / transcript，**不能**覆盖订阅。
_Avoid_: token, secret, app key

**Authorization**:
用户通过 Google 的 OAuth 同意流程授予本插件读取其 YouTube 数据的凭据。**它不是「登录」**：插件没有会话，只有一个可被撤销的授权。
_Avoid_: login, sign-in, session

**Client json**:
用户在自己的 Google Cloud 项目里创建 OAuth 客户端后下载的凭据文件。顶层键标出客户端类型（`web` 或 `installed`），插件从它读 `client_id` / `client_secret`。**就地在原位读，不复制**；路径来自环境变量或约定位置。
_Avoid_: credentials.json, oauth config, app secret

**Redirect URI**:
授权完毕后 Google 把浏览器送去的那一个地址，也就是回环服务器的地址。**它由客户端类型决定**：`installed` 允许任意端口，`web` 必须与 Console 里登记的值**精确一致**（所以 `web` 类型不能换端口）。
_Avoid_: callback URL, loopback address, return URL

**Publishing status**:
Google consent screen 的发布状态：Testing 或 In production。Testing 下授权与 refresh token **7 天后失效**；In production 即解除。插件**检测不到**它属于哪一种，所以相关的提醒只能是条件句。
_Avoid_: app status, verification status, consent mode

**Testing status**:
Google consent screen 的发布状态之一。此状态下授权与 refresh token **在授权后 7 天失效**；切到 In production 即解除。插件只提醒，替用户决定的是用户。
_Avoid_: dev mode, sandbox, unpublished

**Refresh token**:
可换取新 access token 的长期凭据，只在首次同意时返回。它失效与否**只有 Google 说 `invalid_grant` 才算**——本地记的到期时间不可靠。
_Avoid_: offline token, long-lived token

**Access token**:
一小时寿命的通行证，快到期时用 Refresh token 换新的。它不值钱，所以不落成环境变量、不进模型上下文。
_Avoid_: bearer token, session token

**Credential file**:
插件自己写的凭据文件（API key 与 OAuth token 各一），落在 `getAgentDir()` 下，**文件 0600 · 目录 0700**，写入先过写队列。它和 Client json 不是一回事：那个是用户下回来的，这个是我们写出去的。
_Avoid_: auth file, secrets file, keystore, config

### 能力与集成

**Subscription**:
用户订阅（关注）的一个频道。本插件里**只有它需要 OAuth**，也只有它在当前范围内。
_Avoid_: follow, 关注列表, channel list

**Capability**:
YouTube 侧的一件只读事（搜索、视频详情、字幕、订阅），与任何宿主无关。
_Avoid_: feature, endpoint, API call

**Tool**:
Capability 暴露给**模型**的形式：名字、描述、JSON Schema、handler。名字用 `youtube_*`，因为模型选工具时要知道的是能力，不是包名。它返回 `data` 与 render fields，**不返回给模型读的文本**。
_Avoid_: function, command, endpoint

**Action**:
Capability 暴露给**用户**的形式：`authorize` / `deauthorize` / `status` / `set-api-key` / `clear-api-key`。用户触发，不是模型触发——授权是同意行为，不该由模型引起副作用。动作名保持中性，**宿主把它映射成自己的命令名**。
_Avoid_: command, slash command, operation, login

**Host**:
能表达 JSON Schema 并调用函数的任意 agent 运行时。Pi 是当前的第一个宿主，不是唯一一个。
_Avoid_: runtime, platform, client, agent SDK

**Adapter**:
把 Tool 契约翻译成某个宿主的形式的那一层薄代码。它只做翻译。
_Avoid_: integration, plugin, connector, driver

**Seam**:
Capability 与 Host 之间的边界，vibi 有**两条**：Tool 给模型，Action 给用户。两条都归 core 声明，宿主只做呈现。
_Avoid_: interface, abstraction layer, plugin API

**Spill**:
结果超过阈值（8,000 字符）时把**全文落盘**为 JSONL（一行 = 一个字幕段），只把预览与指针交回宿主。落盘用 `videoId` 兜住同名覆盖。它**不是截断**：没有任何内容被丢掉。
_Avoid_: dump, export, cache, truncate

**Preview**:
Spill 发生时交回宿主的两段窗口：开窗与收窗，各 2,000 字符。缩略图式的定向信息，不是摘要。
_Avoid_: excerpt, snippet, summary

**Render fields**:
宿主渲染结果时**必须**呈现的事实：`truncated` / `spilled`（数组）/ `preview` / `records`。「发生过什么」是字段，「怎么读」是宿主的事——所以 `truncated` 永远是布尔字段，永远不是一句可能被省略的散文。
_Avoid_: metadata, envelope, details

**Detail**:
结果的详略档位，只有两个值：`compact`（只给预览，**永不落盘**）与 `full`（全都给，装不下就溢写）。Search 没有这个档位。
_Avoid_: format, mode, verbosity, include

**Failure code**:
失败的**闭集**标签，分两族：**工具族**（`not_authorized` / `quota_exceeded` / `not_found` / `transcript_unavailable` / `invalid_input` / `network_or_upstream_error` / `unknown_tool`）与**授权族**（`authorization_denied` / `redirect_uri_mismatch` / `client_config_invalid` / `port_in_use` / `service_disabled` / `authorization_timeout`）。每个带一句可执行的 `hint` 与一个 `retryable` 布尔。它回答的是「换个说法重试有没有意义」。
_Avoid_: error type, status, error message
