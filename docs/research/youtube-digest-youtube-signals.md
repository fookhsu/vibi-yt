# YouTube Digest：候选发现、趋势信号与配额边界

- 对应 ticket：[#17](https://github.com/fookhsu/vibi-yt/issues/17)
- 查询日期：**2026-09-11 UTC**
- 证据范围：Google / YouTube 官方开发者文档、官方 Help、官方 Developer Policies；没有使用二手资料。
- API 实测：本次环境没有 `YOUTUBE_API_KEY`，因此未发带凭据的一手 API 请求；所有能力判断均来自查询日可访问的官方文档。未由文档给出上限的地方明确标为不确定，不以经验值补齐。

## 结论摘要

1. Interest 的通用公开召回入口是 [`search.list`](https://developers.google.com/youtube/v3/docs/search/list)：`part=snippet&type=video&q=...&publishedAfter=...`，可叠加 `regionCode`、`relevanceLanguage`、`videoCategoryId` 等。最近 7 天可以做**发布时间硬过滤**，但搜索索引可能延迟，非 `relevance` 排序与日期过滤组合可能返回较小或不完整的结果集。
2. [`videos.list`](https://developers.google.com/youtube/v3/docs/videos/list) 用于补全候选的元数据、时长、地区限制、当前累计统计和直播状态；[`videos.batchGetStats`](https://developers.google.com/youtube/v3/docs/videos/batchGetStats) 可低成本刷新当前统计，但两者都不返回历史统计序列。
3. 官方 API 不能回溯任意公开视频过去 72 小时的 views 增量。自行定时保存快照只能从首次观测后近似计算，而且查询日有效的 [Developer Policies](https://developers.google.com/youtube/terms/developer-policies) 默认禁止从 API Data 派生 score / metric；官方把 “Top YouTuber by View Growth” 明列为只有接受 [derived metrics amendment](https://developers.google.com/youtube/terms/derived-metrics-policy) 后才允许的例子。
4. `videos.list(chart=mostPopular)` 已不再代表通用 Trending Now。自 2025-07-21 起，它只汇集 Trending Music、Movies、Gaming charts，且不能同时使用 `q` 或 `publishedAfter`，最多只能作为这三个领域的地区性补充源。
5. `regionCode` 是可观看地区约束 / 内容地区偏好，不是创作者国籍；`relevanceLanguage` 只是相关性偏好，不是语言硬过滤。公开视频没有可靠的自动检测口语字段。
6. Data API 没有 Shorts 标记，也没有可靠的画面纵横比字段；仅凭时长无法排除 Shorts。官方当前规则包含“方形或竖屏 + 最长三分钟 + 上传日期 / 频道类型”，所以首版无法仅靠官方 Data API 严格满足“排除 Shorts”。
7. Subscription 增强可用 OAuth 调 `subscriptions.list(mine=true)` 获得频道，再走频道 uploads playlist；官方明确建议最新上传不要依赖 `search.list(order=date)`，而应使用 uploads playlist。
8. 查询日的 quota 已改为 granular model：`search.list` 每次 1 个 Search Queries unit、默认单独 **100 calls/day**；其他本文所需的常规 `list` 大多每次 1 unit、默认合计 10,000/day。分页每一页都是一次新请求。

---

## 事实

### 1. Interest 候选召回

#### 1.1 `search.list` 是唯一通用关键字召回入口

推荐请求骨架：

```text
GET /youtube/v3/search
  ?part=snippet
  &type=video
  &q=<Interest 查询>
  &publishedAfter=<now-7d, RFC3339>
  &publishedBefore=<now, RFC3339>
  &regionCode=<ISO 3166-1 alpha-2>
  &relevanceLanguage=<通常为 ISO 639-1；中文用 zh-Hans / zh-Hant>
  &maxResults=50
  &order=relevance
```

官方 [`search.list`](https://developers.google.com/youtube/v3/docs/search/list) 给出的相关事实：

- `part` 必填且只可设为 `snippet`；不设 `type=video` 时默认会混入 video、channel、playlist。
- `q` 支持 `-`（NOT）和 `|`（OR），因此 Interest 的包含 / 排除词可以进入召回 query；这只是搜索语法，不代表严格的全文布尔匹配。
- `publishedAfter` / `publishedBefore` 接受 RFC 3339 时间，可实现“发布时间在最近 7 天”的服务端过滤。
- `order` 支持 `relevance`、`date`、`rating`、`viewCount` 等。`rating` 是 YouTube 内部算法分，并不等于 like 数降序；`viewCount` 是当前累计 views 降序（直播中则按 concurrent viewers）。
- 官方特别警告：非 `relevance` 排序可能产生更小或不完整的结果集，尤其与日期过滤组合时；`order=date` 还受搜索索引延迟影响。
- `videoCategoryId`、`videoCaption`、`videoDuration`、`videoDefinition`、`videoEmbeddable`、`videoSyndicated`、`eventType` 等视频过滤器都要求 `type=video`。
- `videoDuration` 只有 `<4min`、`4–20min`、`>20min` 三档，不能指定任意最短 / 最长时长。
- 每页 `maxResults` 为 0–50，默认 5；即使还有结果，内部排序 / 过滤也可能让本页少于请求数，是否继续只能看 `nextPageToken`。
- `pageInfo.totalResults` 是近似值，最大显示 1,000,000，官方要求不要用它构造分页。
- 仅当同时设置 `channelId` 和 `type=video`（且不是 owner / developer 特殊过滤）时，结果总量明确限制为最多 500 个视频。

搜索返回的 [`search` resource](https://developers.google.com/youtube/v3/docs/search) 主要只有 video ID 与 `snippet`（`publishedAt`、channel、title、description、thumbnail、`liveBroadcastContent`）；排序所需的完整统计、时长、地区限制等必须再补详情。

#### 1.2 类别 / 本地化辅助端点

- [`videoCategories.list`](https://developers.google.com/youtube/v3/docs/videoCategories/list) 可按 `regionCode` 列出当地可用类别，或按逗号分隔的 category IDs 读取类别；`hl` 只控制返回文本语言。费用 1 unit。类别是上传者赋给视频的粗粒度分类，不是 Interest 的替代品。
- [`i18nRegions.list`](https://developers.google.com/youtube/v3/docs/i18nRegions/list) 与 [`i18nLanguages.list`](https://developers.google.com/youtube/v3/docs/i18nLanguages/list) 各为 1 unit，可校验 YouTube 支持的地区和 UI / 元数据本地化语言。它们不检测视频语言。

### 2. 候选补全与可用于排序的原始字段

#### 2.1 `videos.list`

建议对召回 ID 调用：

```text
GET /youtube/v3/videos
  ?part=snippet,contentDetails,statistics,status,liveStreamingDetails,topicDetails
  &id=<comma-separated video IDs>
```

[`videos.list`](https://developers.google.com/youtube/v3/docs/videos/list) 每次 1 unit；2020-07-29 后 `part` 不再额外加 quota（见官方 [Revision History](https://developers.google.com/youtube/v3/revision_history#july-29,-2020)）。相关字段定义来自官方 [`video` resource](https://developers.google.com/youtube/v3/docs/videos)：

| part | 可用字段 | 对 Digest 的用途 / 边界 |
| --- | --- | --- |
| `snippet` | `publishedAt`, `channelId`, title, description, tags, `categoryId`, `liveBroadcastContent`, `defaultLanguage`, `defaultAudioLanguage` | 相关性、发布时间、频道与语言线索。`publishedAt` 通常是公开时间而非上传时间；语言字段可缺失。 |
| `contentDetails` | ISO 8601 `duration`, `caption`, `regionRestriction.allowed/blocked`, definition | 时长、是否声明有字幕、指定地区可播放性。`caption=true` 不提供字幕文本。 |
| `statistics` | 当前累计 `viewCount`, `likeCount`, `commentCount` | 只是查询时快照；没有时间序列。dislike 对非 owner 已是私有；favorite 已弃用且恒为 0。 |
| `status` | `privacyStatus`, `embeddable`, `madeForKids` | 可用性 / 展示约束。即使 `embeddable=true`，平台政策或第三方 claim 仍可能阻止嵌入。 |
| `liveStreamingDetails` | actual / scheduled start/end；仅进行中可能有 `concurrentViewers` | 区分已结束直播与普通视频，排除 active / upcoming。直播结束后 concurrent viewers 不再提供。 |
| `topicDetails` | topic IDs / Wikipedia topic category URLs | 可做稀疏主题线索；并非所有视频都有，不能代替 `q`。 |

`id` 接受逗号分隔 IDs，但查询日的 method page **没有声明 ID 数量上限**；`maxResults` 又明确不支持与 `id` 一起使用。因此不能把常见的“50 IDs/call”当作文档保证，实施时应以一手 API 合约测试确定批大小，并保留按 URI / API 错误缩小 batch 的行为。

#### 2.2 `videos.batchGetStats`

[`videos.batchGetStats`](https://developers.google.com/youtube/v3/docs/videos/batchGetStats) 于 2026-06-03 加入，接受逗号分隔 `id` 和 `part=snippet,statistics,contentDetails`，返回：

- `snippet.publishTime`；
- 当前 `viewCount` / `likeCount` / `commentCount`；
- `duration` / `durationMillis`；
- 成功、失败及失败 IDs 汇总。

费用为 1 unit。官方 [Revision History（2026-06-03）](https://developers.google.com/youtube/v3/revision_history#june-3,-2026) 说它有独立 granular bucket，默认 10,000 units/day。它没有 page token，文档也未声明每次最多 IDs 数，必须把 batch 上限列为待一手验证项。它适合已知 ID 的轻量统计刷新，但缺少语言、地区限制、直播详情和 status，不能替代首次 `videos.list`。

### 3. 最近 7 天与 72 小时势头

#### 3.1 官方能直接给出的时间 / 热度信息

- `search.list.publishedAfter=now-7d` 能硬过滤发布时间；详情阶段应再次使用 `videos.snippet.publishedAt` 校验边界。[`publishedAt` 定义](https://developers.google.com/youtube/v3/docs/videos#snippet.publishedAt) 说明公开时间可能不同于上传时间，私有 / unlisted / members-only 还有特殊语义。
- `videos.statistics` / `videos.batchGetStats.statistics` 给出查询当下的累计 views、likes、comments，**没有按小时 / 天的公开历史值**。
- 仅有一次快照时，对发布不足 72 小时的视频，“当前 views ÷ 发布年龄”只是全生命周期平均速度；对已发布 3–7 天的视频，无法还原其最近 72 小时增量。
- [`search.list(order=viewCount)`](https://developers.google.com/youtube/v3/docs/search/list#order) 只按当前累计 views 排序，不是最近 72 小时增长；且与日期过滤组合存在结果不完整警告。
- YouTube Analytics [`reports.query`](https://developers.google.com/youtube/analytics/reference/reports/query) 虽可按 day 查询 views，但所有请求必须 OAuth，`ids=channel==MINE` / 当前已授权用户频道，或 content owner。它不能读取 Interest 候选所属第三方频道的历史数据。

#### 3.2 `mostPopular` 不是通用趋势榜

[`videos.list(chart=mostPopular,regionCode=...,videoCategoryId=...)`](https://developers.google.com/youtube/v3/docs/videos/list) 费用 1 unit、每页最多 50。它不能同时接受 `q`、`publishedAfter` 或 `relevanceLanguage`。官方 [2025-07-10 revision note](https://developers.google.com/youtube/v3/revision_history#july-10,-2025) 明确：从 2025-07-21 起，`mostPopular` 从原来的 Trending Now 改为 Trending Music、Movies、Gaming charts，配合 Trending page 下线。

所以它只能为 Music / Movies / Gaming Interest 提供地区性先验候选；不能支撑任意 Interest，也不保证“最近 7 天”。

#### 3.3 views 口径发生过变化

官方 [Revision History（2026-08-27）](https://developers.google.com/youtube/v3/revision_history#august-27,-2026) 说明，从 2026-08-24 起 long-form、Live、Shorts 的公开 `viewCount` 都在开始播放第一帧时计数（含 autoplay / hover / 点击播放）；engaged view 仍是不同指标且只在 Analytics 语境可见。另有 [2025-03-26 Shorts 变更](https://developers.google.com/youtube/v3/revision_history#march-26,-2025)。跨口径变更日的长期快照不应直接比较；即使当前 7 天窗口已在新口径内，报告仍应记录统计采样时间与口径版本。

### 4. 地区与语言

#### 地区事实

- [`search.list.regionCode`](https://developers.google.com/youtube/v3/docs/search/list#regionCode) 要求 ISO 3166-1 alpha-2，并指示返回“可在该国家观看”的视频；响应也会回显所用 region。它不是创作者国籍或内容发生地。
- [`videos.contentDetails.regionRestriction`](https://developers.google.com/youtube/v3/docs/videos#contentDetails.regionRestriction) 给出 allowed 或 blocked 国家列表，可在详情阶段校验目标地区是否可播放。
- `search.location` / `locationRadius` 只匹配上传者在 metadata 中填写了地理位置的视频，半径最大 1000 km；不能作为一般地区兴趣过滤。
- `channels.brandingSettings.channel.country` 是频道设置中的国家字段且可缺失，不能代替可播放性或内容地区。

#### 语言事实

- [`search.list.relevanceLanguage`](https://developers.google.com/youtube/v3/docs/search/list#relevanceLanguage) 只是让结果对指定语言“最相关”；官方明确说高度相关时仍会返回其他语言，因此它不是 hard filter。
- [`videos.snippet.defaultLanguage`](https://developers.google.com/youtube/v3/docs/videos#snippet.defaultLanguage) 是 title / description 元数据语言，`defaultAudioLanguage` 是默认音轨语言；两者由资源元数据提供且可能缺失，不是公开的自动语言检测结果。
- `videos.list(hl=...)` 只请求该应用语言的本地化 title / description，缺少本地化值时回退默认 metadata；它不翻译 / 检测音频。

### 5. 视频类型：普通视频、直播、首映、Shorts

#### 直播 / 首映

- [`snippet.liveBroadcastContent`](https://developers.google.com/youtube/v3/docs/videos#snippet.liveBroadcastContent) 值为 `live`、`upcoming`、`none`。`none` 同时覆盖普通视频和已结束且仍可观看的直播。
- `liveStreamingDetails.actualEndTime` 仅结束后出现；因此可用 `liveBroadcastContent in {live,upcoming}` 排除正在直播和未开始项目，以 `actualEndTime` 标记允许进入的已结束直播。
- [`search.list.eventType`](https://developers.google.com/youtube/v3/docs/search/list#eventType) 可单独搜索 `completed` / `live` / `upcoming` broadcast，但没有“普通视频 + completed”联合值。通用召回应不设它，再在详情阶段分类。

#### Shorts 无官方 Data API 判定字段

官方 Help 的 [three-minute Shorts eligibility](https://support.google.com/youtube/answer/15424877) 说明：标准频道在 2024-10-15 后上传的方形或竖屏、最长三分钟视频会归为 Shorts；Official Artist Channels 的对应日期为 2025-12-08。与此同时，[`video` resource](https://developers.google.com/youtube/v3/docs/videos) 没有 `isShort` / Shorts type 字段，也没有原视频纵横比字段；thumbnail 宽高不是原视频纵横比，`player` 的尺寸是 embed 布局。

因此：

- `videoDuration=medium|long` 会排除所有 `<4min` 视频，误杀大量普通短视频，且仍不能表达 Shorts 的三分钟规则；
- 详情后以 `duration <= 3min` 排除也会误杀横屏普通视频；
- 保留短时长视频则会漏进 Shorts；
- 仅使用官方 Data API 时，**严格排除 Shorts 不可实现**，只能选择并公开一个有误差的 duration heuristic，或修改产品要求。

### 6. Subscription 增强路径

#### 6.1 取得订阅频道

[`subscriptions.list`](https://developers.google.com/youtube/v3/docs/subscriptions/list)：

```text
GET /youtube/v3/subscriptions
  ?part=snippet,contentDetails
  &mine=true
  &maxResults=50
```

- 必须使用用户 OAuth；支持 `youtube.readonly` 等 scope，API key 不能满足 `mine=true`。
- 每次 1 unit，每页最多 50，使用 `nextPageToken`；官方没有声明用户 subscriptions 总页数硬上限。
- `snippet.resourceId.channelId` 是所订阅频道。
- `contentDetails.newItemCount` 是“自 subscription content 上次被读取后的新项目数”，`totalItemCount` 也是 approximate；两者不给 video ID，也不是固定 7 天窗口，因此不能直接充当候选 / 势头。

#### 6.2 可靠获取订阅频道最近上传

对上一步频道 IDs：

1. [`channels.list(part=contentDetails&id=...)`](https://developers.google.com/youtube/v3/docs/channels/list)（1 unit）取得 `contentDetails.relatedPlaylists.uploads`。
2. 每个选中的 uploads playlist 调 [`playlistItems.list(part=contentDetails,snippet&playlistId=...&maxResults=50)`](https://developers.google.com/youtube/v3/docs/playlistItems/list)（每页 1 unit），读取 `contentDetails.videoId` 和 `contentDetails.videoPublishedAt`。
3. 对 7 天内 IDs 去重，再以 `videos.list` 补全 / 过滤。

官方在 [`search.list(order=date)` 的说明](https://developers.google.com/youtube/v3/docs/search/list#order) 中明确要求：若要可靠取得一个频道的最新上传，不要用搜索索引，改用 `playlistItems.list` 读取 uploads playlist。

成本上的关键边界是“每个 playlist 一次请求”：如果对所有订阅频道逐页扫描，费用和延迟按频道数线性增长。必须先规定每次最多处理多少订阅频道、每频道最多几页；只读取每频道第一页最多 50 个通常已覆盖 7 天高水位，但官方没有保证任意频道 7 天内少于 50 个上传。

#### 6.3 可选 push，不适合作为首版本地必需项

官方 [Push Notifications guide](https://developers.google.com/youtube/v3/guides/push_notifications) 可按频道通过 WebSub 接收上传、title / description 更新通知，避免轮询；但需要一个 hub 可回调的 HTTP callback URL，且不是“订阅了哪些频道”的 OAuth feed。纯本地、非持续在线的 Digest 仍需轮询 / 补漏，不能依赖 push 保证完整。

### 7. Transcript 不是官方 Data API 的公开视频路径

- [`captions.list`](https://developers.google.com/youtube/v3/docs/captions/list) 要 OAuth（如 `youtube.force-ssl`），每个视频 50 units，并明确“response does not contain the actual captions”，只返回 track metadata。
- [`captions.download`](https://developers.google.com/youtube/v3/docs/captions/download) 每个 track 200 units，且调用用户必须有编辑该视频的权限。

因此第三方公开视频 transcript **没有官方 YouTube Data API 路径**。现有非官方字幕来源可以作为产品的可选增强，但不能被本报告计为官方能力 / quota，也不能成为首版候选发现或趋势判断的硬依赖。本报告按要求不扩展研究 Pi。

### 8. Quota 与分页边界（查询日现状）

官方 [Quota Calculator / table](https://developers.google.com/youtube/v3/determine_quota_cost) 与 [Revision History（2026-06-01）](https://developers.google.com/youtube/v3/revision_history#june-1,-2026) 显示，YouTube 正转向 granular quota：

- 每个请求（包括 invalid request）至少收费 1；每个额外分页请求重复收费。
- `search.list` 有独立 Search Queries bucket，默认 100 calls/day，每次 1 unit。
- `videos.batchGetStats` 的 method page 标 1 unit；revision history 另说明其独立 bucket 默认 10,000/day。当前 Quota Calculator 的方法表尚未列出该新方法，这是一个文档遗漏 / 待 Console 验证项。
- 其他本文使用的普通 endpoints 默认共享 10,000 units/day。
- 默认值可能变化；项目的 Google Cloud Console Quotas 页面才是运行时事实。日配额在 Pacific Time 午夜重置。

| 调用 | part / 关键参数 | 单次 cost | 单页 / 单请求上界 | 文档化总上界 |
| --- | --- | ---: | --- | --- |
| `search.list` | `part=snippet`, `type=video`, `q`, date, region, language | 1 Search Queries unit | 50 results/page | 默认 100 calls/day；一般总页数无保证；`channelId+type=video` 最多 500 results |
| `videos.list` by ID | `snippet,contentDetails,statistics,status,liveStreamingDetails,topicDetails` | 1 general unit | ID 数量未声明；`maxResults` 不适用于 `id` | 未声明 |
| `videos.list` chart | `chart=mostPopular`, region/category | 1 general unit | 50/page | 未声明页数；内容只覆盖 Music / Movies / Gaming charts |
| `videos.batchGetStats` | `id`, `part=snippet,statistics,contentDetails` | 1 granular unit | ID 数量未声明；无 pagination | revision 称默认 10,000/day |
| `subscriptions.list` | `snippet,contentDetails`, `mine=true` | 1 general unit | 50/page | 未声明 |
| `channels.list` | `contentDetails`（可加 `statistics,snippet`） | 1 general unit | `maxResults` 最多 50；ID batch 数未单独声明 | 未声明 |
| `playlistItems.list` | `contentDetails,snippet`, uploads `playlistId` | 1 general unit | 50/page | 未声明 |
| `videoCategories.list` | `snippet`, region 或 IDs | 1 general unit | 无 `maxResults` 参数 | 返回匹配类别集合 |
| `i18nRegions.list` / `i18nLanguages.list` | `snippet` | 各 1 general unit | 无分页参数 | 返回支持集合 |
| `captions.list` | `id,snippet`, `videoId` | 50 general units | 单视频 tracks | 无字幕文本 |
| `captions.download` | caption track `id` | 200 general units | 单 track | 只限可编辑视频 |

> 注：项目 README 中“search 100 units/call”的历史说法不再是查询日官方计费模型；本报告只采用 2026-09-11 官方当前页。实施仍应读取 / 展示 Cloud Console 的实际 bucket，而不是把默认值写死为用户承诺。

### 9. 官方拿不到的数据

对任意第三方公开视频，Data API 不提供：

- 过去某时点的 view / like / comment 值或“最近 72 小时 views”；
- impressions、CTR、watch time、average view duration、audience retention、unique viewers、engaged views；这些属于频道 owner 的 Analytics 范畴；
- 公开 dislike count；
- YouTube 推荐系统的 relevance / quality / trust 分数；`search.order=rating` 的内部算法值也不作为字段返回；
- 可靠的口语检测语言；
- Shorts 标记或原视频纵横比；
- 第三方公开视频的官方 transcript 文本；
- 历史 mostPopular / Trending chart 快照；
- 某 video 当前是否被用户“看过”的 watch history（本地图也明确不读取）。

### 10. Developer Policies 是趋势评分的硬边界

查询日官方 [Developer Policies 的 “Handling YouTube Data and Content”](https://developers.google.com/youtube/terms/developer-policies#e.-handling-youtube-data-and-content) 要求：

- 默认不得用 API Data 创建新的 / 派生 data 或 metrics；官方例子明确禁止把 likes、views 等做成一个 score。
- 非授权公开统计不得保存超过 30 天；其他 Non-Authorized Data 也应在 30 天内删除或刷新。面向用户显示时须使用最新可得 API Data；历史值可以显示，但必须准确标注其时间语境。
- 使用 YouTube search 的客户端不得修改 / 替换返回结果中的文字、图片或信息；并须清楚标识 YouTube 为来源。

2026-06-01 生效的 [Additional policies for derived metrics and data storage](https://developers.google.com/youtube/terms/derived-metrics-policy) 给出例外：开发者需通过标准 quota extension，以 **Analytics & Reporting** 用例接受政策修订。获接受后，官方示例允许 custom scores、content categorization / tagging、sentiment，以及 “daily or weekly Top YouTuber by View Growth”；统计和派生 metrics 最长可存 36 个月，title / creator / description 等非统计数据仍遵循 30 天刷新 / 删除。

这意味着“保存 views 快照 → 计算 72h delta → 排 Trending lane”的技术可行性，不等于默认政策许可。未获该修订前，不应把派生 velocity / 综合质量分作为实现既定事实。

---

## 推论 / 风险

以下是由上述事实导出的产品推论，不是 YouTube 官方保证。

1. **最近 7 天可实现，72 小时历史势头不可即时回溯。** 首次运行只能基于当前累计值和年龄作近似；只有从本产品开始采样后，才能在采样间隔误差内得到 delta。
2. **72h delta 当前有政策前置条件。** 即使只保留 7 天快照，计算 view growth 仍属于 derived metric；应先确认 / 取得 derived-metrics amendment，而不是只做数据保留期控制。
3. **不能把 `viewCount / age` 称作 “72 小时增长”。** 它是发布以来平均速率；3–7 天候选尤其会误导。若展示，应命名为产品自己的估计并披露来源 / 采样时间，且仍需先解决 derived-metric 许可。
4. **`order=viewCount` 不是 velocity，且会牺牲 recall。** 它可成为单独、硬上限的热门候选 route，但不能替代 `order=relevance`，也不能承诺完整。
5. **通用 `mostPopular` lane 不存在。** 对非 Music / Movies / Gaming Interest 使用它会引入主题偏差；即使在这三类中，也要本地做 7 天与 Interest 校验。
6. **语言匹配只能软处理。** `relevanceLanguage`、metadata language、default audio language 都不能证明实际口语；地图中“语言不匹配降权而非硬过滤”的已有方向与 API 边界一致。
7. **严格排除 Shorts 与“只用官方 Data API”冲突。** duration heuristic 必有误杀 / 漏放，应在原型和 UI 中明确，而不是伪装成准确类型判断。
8. **Subscription 增强的瓶颈不是 unit 总额，而是 fan-out。** 每频道 uploads playlist 至少一请求；订阅数多时必须限制选取频道与页数。可以对 search 已召回视频做“来自 Subscription”加权，以较低额外成本起步；主动补全所有订阅频道上传则应是受限的第二阶段。
9. **Quality 不能由官方字段直接证明。** views / likes / comments 是 popularity / engagement 原始量，不是扎实或可信；频道 subscriber count 还会按三位有效数字向下取整且可隐藏。Transcript / 模型也只是可选的产品判断，不是 YouTube quality signal。
10. **90 天去重需单独做政策审查。** 用户自己的“何时被本产品推荐 / 显式 Feedback”可被视为产品数据，但若同时长期保存 video ID、title、统计等 API Data，30 天规则可能适用。不要默认 90 天历史可以原样缓存完整 YouTube resource。

---

## 后续决策输入

地图后续 ticket 应显式决定以下事项；这些不是本研究代做的产品决策。

### A. 候选 route 与硬上限

建议作为待确认基线：

- 每个 Interest：`search.list(order=relevance)` **最多 1 页 / 50 条 / 每次 Digest**；是否另开 `order=viewCount` route 会把 Search bucket 消耗翻倍，并承担不完整结果风险。
- 全 Digest：search calls 必须有全局上限，且不得超过 Cloud Console 实际 Search Queries bucket；默认 100/day 不是每用户保证。
- 详情：先跨 Interest / Subscription 去重 IDs，再调 `videos.list`；实施前用真实 API 验证 `videos.list` 与 `batchGetStats` 的安全 ID batch 大小，因为官方页面未声明。
- Subscription：规定最多处理的频道数（例如最近订阅或本地轮转的固定 N）和每频道最多 1 个 uploads page；不能无界 fan-out。
- `mostPopular`：默认关闭，或只对 Music / Movies / Gaming 明确启用；必须再次执行 7 天和 Interest 过滤。

一个仅用于量级判断的例子：5 个 Interest 各 1 个 search page，会消耗 5 / 100 个 Search Queries calls；普通 units 主要来自详情以及 Subscription fan-out。若主动扫 50 个订阅频道且每频道一页，仅 playlist items 已是 50 general units，仍远低于默认 10,000，但延迟和候选量需要单独硬限。这个例子不假设未文档化的 ID batch 上限。

### B. Trending lane 的定义

必须在以下能力边界内重写验收语言：

- “最近 7 天” = `publishedAt >= now-7d`，可硬验收；
- “72 小时势头”只有三种诚实状态：
  1. **无历史**：unknown，不伪造；
  2. **候选发布不足 72h**：可展示 raw current views 与年龄，但不能称精确 72h delta；
  3. **有本地采样且政策已允许 derived metrics**：以最接近 `now-72h` 的快照计算，并输出采样间隔 / 覆盖率。
- 在获得 derived-metrics amendment 前，Trending lane 只能保留 YouTube 原始排序 / 原始统计的可解释呈现或暂停 velocity 评分；是否连重排都合规应在实现前完成政策确认。

### C. 类型过滤

- active / upcoming：使用 `liveBroadcastContent` 硬排除；
- completed live：`actualEndTime` 存在时允许；
- Shorts：明确选择“按 duration 保守排除（接受普通短视频误杀）”“允许 Shorts 漏入并标记不确定”或修改官方-only 边界。当前不能写“已准确识别 Shorts”的验收项。

### D. 地区 / 语言

- 地区 hard filter：search `regionCode` + details `regionRestriction`；不要用 channel country 代替。
- 语言 soft score / explanation：`relevanceLanguage` + 可选 `defaultAudioLanguage/defaultLanguage`；字段缺失时标 unknown，不要自动判 mismatch。
- `hl` 只用于展示本地化 metadata，不作为内容语言证据。

### E. Subscription 模式

需要决定首版是：

1. **低成本 boost-only**：只取 subscription channel IDs；普通 search 召回命中这些频道时加“已订阅”解释；或
2. **主动召回**：受限地读取选中频道 uploads playlists，再统一详情、7 天、类型和 Interest 过滤。

后一模式必须定义频道选择 / 轮转、最大频道数、每频道页数、API key 缺失时的降级。`subscriptions.list` 只靠 Authorization；后续公开 channels / playlists / videos 可由 API key 调用，但这涉及现有 Credential source seam，应由规格明确，而不是隐式 OAuth fallback。

### F. 数据 / 政策

实现 ticket 前增加明确 gate：

- 是否申请并获得 quota extension 中的 Analytics & Reporting / derived-metrics amendment；
- 未获允许时哪些排序完全不使用 API-derived score；
- raw API Data 30 天刷新 / 删除策略，72h 快照删除期限，以及用户删除本地数据的路径；
- 90 天去重究竟只保留什么产品事件 / 最小标识，不缓存哪些 YouTube metadata；
- Markdown / JSON 中标注 YouTube 来源、raw vs product-derived、采样时间和不确定状态。

---

## 未确定项清单

1. `videos.list(id=...)`、`channels.list(id=...)`、`videos.batchGetStats(id=...)` 的最大 ID 数量：查询日官方 method pages 未声明；需在有 API key 的隔离测试中验证，不能引用非官方“50”。
2. `videos.batchGetStats` 已由 method page / revision history说明为 1 unit 且独立默认 10,000/day，但查询日 Quota Calculator 方法表漏列；实施时以项目 Cloud Console granular quota 为准。
3. Derived-metrics amendment 是否会接受“兴趣 Digest / recommendation”作为要求的 YouTube analytics use case：官方列出流程和允许例子，但不保证本项目审批结果。
4. 仅基于 API metadata 对候选进行 Interest / Quality 重排是否会被 YouTube 认定为禁止的 derived data / search-result modification：政策文字带来实质风险，实施前应通过 quota / compliance 流程取得书面确认。
5. Shorts：官方 Help 定义与 Data API resource schema 之间确实没有可闭合的判定字段；除非 YouTube 后续新增字段，否则只能保留不确定状态。
