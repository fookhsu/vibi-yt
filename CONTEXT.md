# vibi-yt

vibi-yt 把 YouTube 的**只读**能力以**工具**（给模型）与**动作**（给用户）两条 seam 交给编码 agent，先做 Pi。这份文件只是词汇表：这里定义词，不定义实现（设计与决策见 map issue #1）。

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
用户在自己的 Google Cloud 项目里创建 OAuth 客户端后下载的凭据文件。顶层键标出客户端类型（`web` 或 `installed`），插件从它读 `client_id` / `client_secret`。**就地在原位读，不复制。**
_Avoid_: credentials.json, oauth config, app secret

**Redirect URI**:
授权完毕后 Google 把浏览器送去的那一个地址，也就是回环服务器的地址。**它由客户端类型决定**：`installed` 允许任意端口，`web` 必须与 Console 里登记的值**精确一致**。
_Avoid_: callback URL, loopback address, return URL

**Publishing status**:
Google consent screen 的发布状态，取值 Testing 或 In production。Testing 下授权与 refresh token **7 天后失效**；In production 即解除。插件**检测不到**它属于哪一种，所以相关的提醒只能是条件句。
_Avoid_: app status, verification status, consent mode, testing status

**Refresh token**:
可换取新 access token 的长期凭据，只在首次同意时返回。它失效与否**只有 Google 说 `invalid_grant` 才算**。
_Avoid_: offline token, long-lived token

**Access token**:
一小时寿命的通行证，快到期时用 Refresh token 换新的。
_Avoid_: bearer token, session token

**Credential file**:
插件自己写的凭据文件（API key 与 OAuth token 各一）。它和 Client json 不是一回事：那个是用户下回来的，这个是我们写出去的。
_Avoid_: auth file, secrets file, keystore, config

### 发现与推荐

**Interest**:
用户明确保存的一项内容偏好，以一个主题为核心，可带包含词、排除词、首选语言和地区。它不从用户的沉默或未点击中推断。
_Avoid_: topic, preference, 兴趣标签

**Digest**:
按时或按需生成的一组有限视频，按 Interest 和推荐轨道组织；没有内容达到门槛时可以为空。它不是无限滚动的信息流，也不为凑数降低门槛。
_Avoid_: push, feed, recommendation list, 推荐流

**Trending lane**:
Digest 中收纳近期发布且显现短期增长势头的视频的轨道；时效性不等于质量。
_Avoid_: hot list, viral list, 热搜

**Quality lane**:
Digest 中收纳与 Interest 高度相关、内容扎实且可信的视频的轨道，不要求它正在流行。
_Avoid_: best videos, 精品榜

**Feedback**:
用户对推荐作出的显式判断：已看过、喜欢、不感兴趣或屏蔽频道。没有反馈只用于去重，不被解释成负面信号。
_Avoid_: behavior, implicit preference, click signal

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
Capability 暴露给**用户**的形式：`authorize` / `deauthorize` / `status` / `set-api-key` / `clear-api-key`。用户触发，不是模型触发——授权是同意行为，不该由模型引起副作用。动作名保持中性。
_Avoid_: command, slash command, operation, login

**Command**:
宿主把 Action 暴露成的可输入名字（Pi 上是 `/youtube:authorize` 这类）。**名字是宿主的，动作是 core 的**——所以换一个宿主，动作不变、命令名可以变。
_Avoid_: verb, subcommand, shortcut

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
结果超过阈值（8,000 字符）时把**全文落盘**为 JSONL，只把预览与指针交回宿主。它**不是截断**：没有任何内容被丢掉。
_Avoid_: dump, export, cache, truncate

**Preview**:
交回宿主的两个文本窗口：开窗与收窗，各 2,000 字符。它是缩略图式的**定向信息**，不是摘要。`compact` 只给预览；溢写时预览是通往全文的入口。
_Avoid_: excerpt, snippet, summary

**Render fields**:
宿主渲染结果时**必须**呈现的事实：`truncated` / `spilled`（数组）/ `preview` / `records`。「发生过什么」是字段，「怎么读」是宿主的事——所以 `truncated` 永远是布尔字段，永远不是一句可能被省略的散文。它说的是**相对全文有损失**，不是「相对本次请求有损失」：`compact` 在长内容上会截短，所以它置 `true`；内容短到开窗+收窗即覆盖全文时置 `false`。
_Avoid_: metadata, envelope, details

**Detail**:
结果的详略档位，只有两个值：`compact`（只给预览，**永不落盘**）与 `full`（全都给，装不下就溢写）。Search 没有这个档位。
_Avoid_: format, mode, verbosity, include

**Failure code**:
失败的**闭集**标签，分两族：**工具族**（`not_authorized` / `quota_exceeded` / `not_found` / `transcript_unavailable` / `invalid_input` / `network_or_upstream_error` / `unknown_tool`）与**授权族**（`authorization_denied` / `redirect_uri_mismatch` / `client_config_invalid` / `port_in_use` / `service_disabled` / `authorization_timeout`）。每个带一句可执行的 `hint` 与一个 `retryable` 布尔。它回答的是「换个说法重试有没有意义」。
_Avoid_: error type, status, error message
