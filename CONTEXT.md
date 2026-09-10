# vibi-yt

vibi-yt 把 YouTube 的**只读**能力以工具形式交给编码 agent，先做 Pi。这份文件只是词汇表：这里定义词，不定义实现（实现形态见 `.scratch/vibi/map.md`）。

## Language

### 凭据

**Credential source**:
插件取到调用权限的来源：API key、OAuth 授权、或没有。状态命令只报来源，永不报值。
_Avoid_: login, session, account

**API key**:
项目级的 YouTube Data API v3 密钥，来自环境变量或本地存储文件。能覆盖 search / video details / transcript，**不能**覆盖订阅。
_Avoid_: token, secret, app key

**Authorization**:
用户通过 Google 的 OAuth 同意流程授予本插件读取其 YouTube 数据的凭据。**它不是「登录」**：插件没有会话，只有一个可被撤销的授权。
_Avoid_: login, sign-in, session

**Client json**:
用户在自己的 Google Cloud 项目里创建 OAuth 客户端后下载的凭据文件。顶层键标出客户端类型（`web` 或 `installed`），插件从它读 `client_id` / `client_secret`。
_Avoid_: credentials.json, oauth config, app secret

**Testing status**:
Google consent screen 的发布状态之一。此状态下授权与 refresh token **在授权后 7 天失效**；切到 In production 即解除。插件只提醒，替用户决定的是用户。
_Avoid_: dev mode, sandbox, unpublished

**Refresh token**:
可换取新 access token 的长期凭据，只在首次同意时返回。它的失效方式决定「授权能活多久」。
_Avoid_: offline token, long-lived token

### 能力与集成

**Subscription**:
用户订阅（关注）的一个频道。本插件里**只有它需要 OAuth**，也只有它在当前范围内。
_Avoid_: follow, 关注列表, channel list

**Capability**:
YouTube 侧的一件只读事（搜索、视频详情、字幕、订阅），与任何宿主无关。
_Avoid_: feature, endpoint, API call

**Tool**:
Capability 暴露给模型的形式：名字、描述、JSON Schema、handler。名字用 `youtube_*`，因为模型选工具时要知道的是能力，不是包名。
_Avoid_: function, action, command

**Host**:
能表达 JSON Schema 并调用函数的任意 agent 运行时。Pi 是当前的第一个宿主，不是唯一一个。
_Avoid_: runtime, platform, client, agent SDK

**Adapter**:
把 Tool 契约翻译成某个宿主的形式的那一层薄代码。它只做翻译。
_Avoid_: integration, plugin, connector, driver

**Seam**:
Capability 与 Host 之间的那条边界。它的形状是 `.scratch/vibi/issues/04-grilling-seam-shape.md` 唯一的产出。
_Avoid_: interface, abstraction layer
