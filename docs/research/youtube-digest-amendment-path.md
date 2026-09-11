# R4 — YouTube Data API "Analytics & Reporting" derived-metrics amendment: the real path from the user's perspective

**Report for:** a bring-your-own-API-key (BYO-key) plugin whose users supply their own Google Cloud project / API key.

## Method note (read first)

- This is a **verification and correction pass** of an earlier draft that was produced with **search-retrieval only, no page fetching**, and whose agent had declared `fetch_content` / `get_search_content` / `source_check` unavailable. The draft said of itself: *"I could not open any source page directly (no fetch tool) and `source_check` was not registered. All quotes are search-retrieval reproductions; exact wording must be re-verified."*
- **Verification method:** direct `curl` HTTP fetches of the live primary pages on **2026-09-11 (UTC)**, followed by local HTML→text stripping. All quoted sentences below are copied from the fetched live HTML, with the exact wording preserved (including Google's own typos, e.g. "request from").
- **No page blocked curl.** Every primary page returned **HTTP 200**: derived-metrics-policy, developer-policies, developer-policies-guide, api-services-terms-of-service, developer revision-history, yt_api_form, quota_and_compliance_audits.
- `yt_api_form` is a **server-rendered** Google support form (3.77 MB HTML); its field text, options, required-markers and conditional-display rules were all readable without executing JavaScript. Its *rendered* headings and its exact "Last updated" line are the only things not observable from static HTML.
- No third-party/blog source is used for any policy claim. Inferences are labelled as such.
- **No repo files were modified.** All artefacts are under `/tmp` (`r4-amendment-path.md`, plus fetched copies `dmp.html`, `devpol.html`, `devpolguide.html`, `tos.html`, `form.html`, `quota.html`, `rev.html` and their `.txt` extractions).

---

## 1. Direct answers to R4's seven questions

### Q1. Exact steps and entry point to select "Section 5 → Analytics & Reporting" and accept the amendment

**Answer: the entry point is the YouTube API Services *Audit and Quota Extension Form* (`support.google.com/youtube/contact/yt_api_form`), and the amendment acceptance is a per-project checkbox inside that form's Section 5. It is not in the Cloud Console.**

The derived-metrics policy page states the path and the acceptance in one sentence (exact wording):

> "As a developer, you are generally prohibited from creating metrics that replace or modify the data returned by the YouTube API Services. However, subject to your acceptance of the amendment to the Developer Policies, to support advanced analytics and creator tools, YouTube permits the calculation of specific additional metrics provided they adhere to the following guidelines subject to your acceptance of the amendment to the Developer Policies (select "Section 5: Use Cases, API Integration, and Feature Implementation" then "Analytics & Reporting" as your use case to accept these terms)."

Live form mechanics, verbatim:

- Section 1 heading is **"Section 1: Request Type *"**, with the note: *"All requests for additional quota requests must go through a compliance audit. We also conduct periodic re-audits to ensure API usage is compliant with YouTube's Developer Policies and Terms of Service."* The only two selectable request types are *"Complete a compliance audit to request for additional quota"* and *"Complete a compliance audit to keep current quota (requested to complete re-audit)"*.
- Section 5 heading is **"Section 5: Use Cases and Quota Extension Details *"**.
- Within Section 5, each project block has a *"Use Case Category (or Categories)"* multi-select. The option is **"Analytics & Reporting"**, described as *"For tracking views, subscribers, trends, or comparing channel performance metrics."*
- Selecting that use case reveals the acknowledgment block, which begins: *"Please complete the following section if you want to apply for permission to create derived metrics and/or store statistical data as per our additional policies for derived metrics and data storage."*
- The actual acceptance is the checkbox *"I have read and agree to abide by the additional policies for derived metrics and data storage. I acknowledge that all other Data API policies will continue to apply to my access to, and use of, YouTube API Service(s)"*.
- **Machine-verified details:** the checkbox's DOM id is `analytics_acknowledgement_N` for **N = 1…10**, and it is gated by `data-depends-on="use_case_project_N:analytics"`. In other words the acceptance is **scoped to a specific project number** and **only appears when "Analytics & Reporting" is selected for that project**.
- The acceptance sentence itself hyperlinks to `developer-policies#l.-additional-policies-on-derived-metrics-and-data-storage` (i.e. **Developer Policies §III.L**), confirming where the binding rule lives.

Sequenced steps as published (only the ordering is composed; each step is quoted from the live form or policy page):

1. Identify the Google Cloud **project number** — *"The project number is a series of digits that can be found alongside the Project ID in your Google Cloud Console."* / *"A project number must contain exclusively numeric values."*
2. Open the Audit and Quota Extension Form.
3. Section 1: choose a **compliance audit** request type (both options are audits).
4. Section 2: *"Are you applying: … As an organization … **As an individual user**"*; contact details; if individual, write `"self"` for organisation legal name.
5. Section 3: business model / Google contacts.
6. Section 4: **API Client** details — *"An "API Client" is your website or software application that accesses or uses YouTube API Services."* Requires *Primary Access URL* (required), *Privacy Policy URL* (required), optional ToS URL, and *"Is your API Client publicly accessible? Yes / No"*.
7. Section 5: enter **"How many project numbers are you adding?"** (dropdown 1–10), fill each **Project #N** Google Cloud Project Number, and select the **"Analytics & Reporting"** use case for each project.
8. Tick `analytics_acknowledgement_N` per project, accepting the two amendment terms (quoted in Q5/Q6).
9. Sections 6–7: evidence and attestations, then submit.
10. Wait for review — *"Note: Based on the information provided by you we will make a determination if your use case qualifies for these additional policies for derived metrics and data storage."*

**There is no standalone "accept the amendment" toggle.** Verified: acceptance exists only as the per-project checkbox above; there is no Cloud Console checkbox, no separate agreement page, and no API-scoped consent screen on any page fetched.

> **Correction to the policy text itself:** the derived-metrics page tells you to select *"Section 5: Use Cases, API Integration, and Feature Implementation"*. The string **"Feature Implementation" does not appear anywhere in the live form HTML**, and the live Section 5 is titled *"Use Cases and Quota Extension Details"*. The policy page's cited section name is stale. The *function* it points to (Section 5 → "Analytics & Reporting") is correct.

### Q2. Is this open to individual developers / small, non-audited API Clients?

**Answer: individuals are explicitly accommodated by the form; but "audited" is an explicit stated precondition for the amendment, and there is no non-audit route to accept it.**

- **Individuals are accommodated — verified.** Section 2 asks *"Are you applying: *"* with exactly two options: *"As an organization or on behalf of an organization or registered entity such as a business, enterprise, non-profit etc."* and **"As an individual user"**. The address field says *"If applying as an individual provide your contact details."*; the org-name field says *"If applying as an individual please write "self""*. And **"Organization Size / Type *"** includes **"Independent Developer/Sole Proprietor"**. The draft's unresolved contradiction ("one retrieval says individuals are fine, another says an organisational website is required") is resolved: individuals are fine, but the *"Your Organization's Primary Website"* field is genuinely **required** even for individuals (`aria-required="true"`), so an individual must supply *some* URL.
- **Published criteria are qualitative, not scale-based — verified.** The only eligibility statements on the derived-metrics page are (a) *"Your API Service must reflect an analytics use case on YouTube."* and (b) the acceptance act. **No minimum subscriber count, revenue, organisation type, request volume or traffic threshold appears anywhere** in the fetched corpus for the amendment (the only quantitative bar found relates to quota: the default *"10,000 units per day"*).
- **BUT approval is discretionary**, and the amendment is expressly gated on being an audited developer — see Q6 and the corrections table. There is no self-serve path: the form's only request types are compliance-audit requests.

### Q3. Does the grant attach to a Google Cloud project or to an API Client? One application per project?

**Answer: the submission is per API Client and per project number; the acceptance act itself is per project. This is now verified, not just the "safe assumption".**

Verbatim form text:

> "An "API Client" is your website or software application that accesses or uses YouTube API Services. **This form is for one API Client only. If you have multiple clients, please submit a separate form for each one.**"

> "How many project numbers are you adding?" *(dropdown: 1, 2, 3, 4, 5, 6, 7, 8, 9, 10)*
> "**For more than 10 projects, please complete another form with the additional projects.**"

> "Section 5: Use Cases and Quota Extension Details *" → per-project **"Project #1 … Project #10"** blocks, each with its own Google Cloud Project Number, its own use-case multi-select, and its own `analytics_acknowledgement_N` checkbox.

Supporting policy: Developer Policies **§III.D.1.c** (exact):

> "If your API Client needs to create API Credentials to access or use YouTube API Services, you must create exactly one (1) API Project for that API Client. Those API Credentials are intended to be used exclusively by the associated API Client, which means that you must not use that one (1) API Project for multiple API Clients."

**Synthesis (inference, but tightly constrained by the above):** one form = one API Client + up to 10 project numbers; the derived-metrics acknowledgment is captured **per project number** (`analytics_acknowledgement_N`), which is direct evidence that the acceptance does **not** transfer automatically across projects. Comma-separated typing of multiple numbers is *not* how the live form works; it uses discrete numbered blocks.

**BYO-key consequence (still inference, still unsupported by any official statement):** under §III.D.1.c each user's project is its own API Project, and the plugin cannot be the credential holder. The strongest reading of the evidence is that **each user's project must carry its own acceptance** (`analytics_acknowledgement_N`) — which is architecturally significant, because the plugin's users, not the plugin, would have to submit for and obtain the amendment. **No official page addresses BYO-key / user-supplied-credential products.** This remains the single biggest unresolved question.

### Q4. Metric families permitted after approval, and mapping to the plugin's metrics

**Answer: six named families, all verified verbatim.** The derived-metrics page lists, under *"List of Example Metrics:"*:

1. **Custom Channel Scores and Ratios** — allowed: *"Creating a "Creator Influence Score" based on a weighted formula of average views, subscriber growth rate, and engagement ratios."*; *"Ranking channels on a leaderboard based on a "Content Quality Score" derived from comment-to-view ratios."* Forbidden: *"Misrepresent API Data's definition or provenance (e.g. displaying "subscriber count" as a "score")."*
2. **Financial Performance Projections** — may infer/project revenue *"provided these figures are clearly presented as third-party estimates and not as YouTube approved or published data"*.
3. **Content Categorization and Tagging** — additive sub-genres/tags distinct from `videoCategories.snippet.title`; must be disclosed as your tags; *"Do not: Replace or override a published YouTube category"*.
4. **Viewer Sentiment Analysis** — *"using aggregate data, such as like/dislike ratios or comment analysis"*; *"You cannot use this data to profile users based on protected attributes, such as their age, race, religious affiliation, political leaning, sexual orientation, or health status."*
5. **Gamification and Leaderboards** — allowed: *"A website displaying a daily or weekly "Top YouTuber by View Growth" leaderboard."*; *"A "History of YouTube" line graph showing the 36-month subscriber growth curves of different creators."* Forbidden: framing that fosters harassment/brigading.
6. **Brand Suitability & Safety Scoring** — split into **Planning** (pre-campaign: *"you may use API Data metadata to assess channels and videos for both "Brand Suitability" … and "Brand Safety" for the purpose of influencer marketing, vetting, and matchmaking"*) and **Measuring** (post-campaign: Brand Suitability only; *"you must not use these reports augmented with API Data sourced metadata to make "Brand Safety" claims"*; *"Validated safety reporting requires impression-level data restricted to Brand Safety Reporting Partners."*).

Cross-cutting condition, exact: *"Your API Service must reflect an analytics use case on YouTube."*

Plugin-metric mapping — **the policy does not use the plugin's vocabulary** ("interaction rate", "comment depth", "publisher authority", "recency/momentum"). Mapping remains inference:

| Plugin metric | Closest permitted family | Basis | Confidence |
|---|---|---|---|
| Interaction rate | Custom Channel Scores and Ratios | Google's own allowed example uses *"engagement ratios"* / *"comment-to-view ratios"*. | High (near-direct analogue) |
| Comment depth | Viewer Sentiment Analysis (only family contemplating comment analysis) | **No published family addresses comment structure/depth.** Constraint: comment *text* stays on the 30-day cycle. | Low-medium (genuine gap) |
| Publisher authority | Custom Channel Scores and Ratios | Allowed example includes *"subscriber growth rate"*; *"subscriber count" as a "score"* is forbidden — a *derived* authority score is contemplated, relabelled raw counts are not. | Medium-high for the distinction |
| Recency / momentum | Gamification and Leaderboards | Allowed examples are growth-over-time comparisons. | Medium-high |

### Q5. Storage boundaries: what gets 36 months vs. what stays on the 30-day rule

**Answer: there are TWO live wordings, and they are on two DIFFERENT documents — this was the draft's biggest open item and it is now resolved.**

**Derived-metrics policy page** (heading *"Data Storage"*), exact:

> "If your use case is accepted for additional derived metrics, you may store some statistical data for a duration beyond 30 days.
> Policy III E.4.b, E.4.c, and E.4.d are amended to allow accepted API Clients to store **metrics (e.g., views, likes, subs count, comment counts) from statistical endpoints** for up to 36 calendar months. Derived metrics (such as sentiment analysis) based on retrieved data may also be stored for up to 36 calendar months. Other data (such as video titles, creator names, descriptions, and comment text) must still follow the 30-day refresh and deletion policy in Section III(4)."

**Audit and Quota Extension Form — amendment term 2, i.e. the text you actually accept** (appears 10×, once per project block), exact:

> "2. Section III E.4.b, E.4.c, and E.4.d are amended by allowing you to store **publicly available stats (e.g., views, likes, comment counts)** for up to 36 calendar months. Derived metrics (e.g., custom scores using views, likes, etc.) that are based on retrieved data may also be stored for up to 36 calendar months. Other data (e.g., video titles, creator names, comment text) still must follow the 30-day refresh and deletion policy in Section III(4)."

**So: "publicly available stats" (form) AND "metrics … from statistical endpoints" (policy page).** The draft framed this as *"contradiction between retrievals of the same page"* — it is **not** the same page. It is a genuine divergence between the operative accepted term and the policy page, and the operative term (form) is *broader*. Note also the form's example list omits "subs count" while the policy page's includes it. This is decision-relevant: **a 36-month retention design should be safe under either reading only if the data is publicly available statistical data**, but the narrower "statistical endpoints" phrasing is what the policy page says.

The baseline rules being amended, Developer Policies **§III.E.4 = "Refreshing, Storing, and Displaying API Data"** (verified as the 4th top-level item of §III.E; sub-list is `lower-alpha`):

> **(b)** "API Clients may store the following types of Authorized Data for as long as is necessary provided that the data is used for purposes consistent with the specific consent granted by an active user according to the applicable laws: (i) data retrieved through the YouTube Analytics API service, (ii) data provided through the YouTube Reporting API service, or (iii) statistics provided through other YouTube API services, such as the number of views for a video, the number of channels for a subscriber, or the number of videos in a playlist. … Note that even though an API Client may store this data for more than 30 days, the Client must still ensure every 30 days that it is still authorized by the user to access that data. … To be clear, an API Client must not store statistics retrieved as Non-Authorized Data for more than 30 days. For example, an API Client must not store the subscriber count for a YouTube channel for more than 30 days without authorization from the channel owner."

> **(c)** "API Clients may store all other types of Authorized Data not identified in section (III.E.4.b) for as long as is necessary for the purposes of the specific consent granted by an active user and for no longer than 30 calendar days. After 30 calendar days, the API Client must either delete or refresh the stored data."

> **(d)** "API Clients may temporarily store limited amounts of Non-Authorized Data for as long as is necessary for the purposes of the API Client but not longer than 30 calendar days. As in section (III.E.4.c) immediately above, this means that after 30 calendar days, the API Client must either delete or refresh the stored data."

Definitional basis for the API-key-only case (Developer Policies §IV, exact): *""Authorized Data" means API Data that an active user expressly authorizes an API Client to access or otherwise use via User Credentials."*; *""Non-Authorized Data" means API Data accessible by an API Client without User Credentials."*

**Consequence for a BYO-key plugin:** public-channel data fetched with only an API key is **Non-Authorized Data** → §III.E.4.d → 30-day ceiling, deletable-or-refreshable. The 36-month amendment is what lifts that ceiling, and only for *statistical* data/derived metrics — **never** for titles, creator names, descriptions or comment text.

### Q6. What happens if derived metrics are computed WITHOUT the amendment?

**Answer: the Developer Policies prohibit it; the derived-metrics page adds a stated consequence (quota reduction or termination); the ToS §3.1 supplies the suspension/termination right; the guide says plainly "don't".**

1. **Prohibition — Developer Policies §III.E.4.h** (exact; the subsection letter in the draft was **correct**):
   > **(h)** "Your API Clients must not (i) replace API Data with similar, independently calculated data, or (ii) access or use API Data to create new or derived data or metrics. To the extent your API Clients display any information, data or metrics not based on API Data alongside API Data, your API Clients must include a clear and prominent disclosure there that such information, data and metrics are not from YouTube and are part of your own product."

   The amendment also amends a second clause the **draft missed**: form term 1 says *"**Sections III E.2.a and E.4.h** are amended to allow you to create derived metrics for limited purposes on the condition that you clearly and prominently label these metrics as generated independently by you and not sourced directly from YouTube's API."* **§III.E.2.a** is the aggregation prohibition: *"Do not aggregate API Data except that you may only aggregate API Data relating to YouTube channels that are under the same content owner as recognized by YouTube pursuant to content licensing agreement(s)…"* So the amendment **loosens aggregation as well as the derived-metrics ban**.

2. **Stated consequence on the derived-metrics page itself** (the draft did not surface this), exact:
   > "Note: You must distinguish these metrics from metrics sourced from API Data. **Violating these policies may result in API quota reduction or termination of your API access.**"

3. **Explicit "don't do it unapproved" instruction** — *Complying with YouTube's Developer Policies*, exact:
   > "If you have not applied for this permission and/or your use case has not been approved, don't create derived metrics and/or store data beyond what is permitted in the developer policies."

4. **Audited-developer precondition** — same page and Developer Policies §III.L, exact:
   > "These policies are only applicable to audited developers with analytics use cases that have explicitly applied for permission to create additional metrics and/or store statistical data through the standard quota extension request from (starting June 01, 2026)."

5. **Enforcement right — ToS §3.1** (exact, Q7 below); plus §24.2 *"YouTube reserves the right to (i) suspend or terminate access to, or use of, any aspects of the YouTube API Services by you, your API Client(s) and those acting on your behalf), and (ii) terminate the Agreement … at any time. … Although we will try to give you reasonable notice, we have no obligation to do so."*, and §24.3 *"Upon any suspension, notice of any discontinuance, or termination … you will immediately stop accessing and using all YouTube Property and delete all YouTube API Services (including all API Data) … in your possession or control, including from your servers."*

**No published source states a specific penalty, fine, or notice period for §III.E.4.h alone.** The composition (breach of Developer Policies, which are part of the Agreement per ToS §2.1 → exposure to §3.1/§24 suspension and deletion) is sound but is an inference.

### Q7. Is there any official statement on "personal / local / non-published use"?

**Answer: NO. This is a verified negative finding.**

Exhaustive search of all fetched primary pages (`derived-metrics-policy`, `developer-policies`, `developer-policies-guide`, `api-services-terms-of-service`, `quota_and_compliance_audits`, `yt_api_form`, `revision-history`) for *personal use / personal, non- / private use / non-commercial / local use / solely for your own / your own personal / not published / unpublished* returned **no carve-out of any kind**. The only hits are unrelated: ToS §10.1's *"personal, non-transferable … license"* (about the brand-feature licence, not an exemption), ToS §12's use of *"Personal Data"*, and the form's *"As an individual user"* (which is an **identity** option, not a **use-scope** exemption).

Moreover, the form actively cuts the other way: even a non-public client must supply a **required** *Privacy Policy URL* and a **required** *Primary Access URL*, and must answer *"Is your API Client publicly accessible? Yes / No"*. ToS §12 independently requires it: *"Each API Client will provide and adhere to a published privacy policy…"*. The instruments are framed around *"you"*, *"your API Client(s)"* and *"API Services"* with no visibility or distribution qualifier attached to the derived-metrics amendment. The amendment's only product test is *"Your API Service must reflect an analytics use case on YouTube"* — a product-characterisation test, not a distribution test.

**Practical friction (not a legal exclusion):** the required URL fields and the pervasive *"API Client"* framing make a purely local/personal tool awkward to describe, but nothing published excludes it.

---

## 2. Corrections table

| # | Draft claim (as written) | Status | Verified / corrected wording | Source URL |
|---|---|---|---|---|
| 1 | F1.1: entry point is the audit/quota form, not Cloud Console | **Verified** | Form is *"YouTube Data API Services — Audit and Quota Extension Form"*; Cloud Console used only to read the project number. | https://support.google.com/youtube/contact/yt_api_form |
| 2 | F1.2: select *"Section 5: Use Cases, API Integration, and Feature Implementation"* | **Corrected (partly stale)** | That is the policy page's *own* instruction text, but the live form has **no** such heading — "Feature Implementation" appears **0×** in the form HTML; live Section 5 is **"Use Cases and Quota Extension Details"**. Use case option **"Analytics & Reporting"** is correct. | https://developers.google.com/youtube/terms/derived-metrics-policy vs https://support.google.com/youtube/contact/yt_api_form |
| 3 | F1.3 step 5 quote ("Please complete the following section…") | **Verified verbatim** | Exact match. | https://support.google.com/youtube/contact/yt_api_form |
| 4 | F1.3: multi-project handling / project-number mechanics | **Corrected** | Not comma-separated free text blocks: numeric dropdown **1–10**, discrete **Project #1…#10** blocks, each with its own use case + acknowledgment. | https://support.google.com/youtube/contact/yt_api_form |
| 5 | F1.4: no standalone acceptance toggle outside this flow | **Verified** | Acceptance exists only as per-project checkbox `analytics_acknowledgement_1..10`, gated by `use_case_project_N:analytics`. | https://support.google.com/youtube/contact/yt_api_form |
| 6 | F2.1: criteria qualitative; *"we will make a determination…"* | **Verified** | *"Note: Based on the information provided by you we will make a determination if your use case qualifies for these additional policies for derived metrics and data storage."* plus derived page *"Your API Service must reflect an analytics use case on YouTube."* | https://support.google.com/youtube/contact/yt_api_form · https://developers.google.com/youtube/terms/derived-metrics-policy |
| 7 | F2.2: "audited developers" sentence — **medium-low confidence, single-source**, quoted as *"standard quota extension request form"* | **Verified & upgraded** | Sentence is live on **two** documents (guide §"Additional policies…", and Developer Policies **§III.L**), so **not** single-source. Exact live wording is *"…through the standard quota extension request **from** (starting June 01, 2026)."* — "from", not "form" (Google's own typo). The revision-history entry for May 4, 2026 **does** say *"request form"*. | https://developers.google.com/youtube/terms/developer-policies-guide · https://developers.google.com/youtube/terms/developer-policies · https://developers.google.com/youtube/terms/revision-history |
| 8 | F2.2: the "(starting June 01, 2026)" parenthetical date — *"unresolved; do not rely on it"* | **Resolved (ambiguous-but-primary)** | Revision history: policy **added** on **May 4, 2026** (guide's Last-updated is 2026-05-04); **June 1, 2026** entry: *"Updated the Additional policies on derived metrics and data storage to clarify that if your use case is accepted for additional derived metrics, you may store some statistical data for a duration beyond 30 days."* The date is a **policy effective date**, not evidence of a form-route change. (Note the oddity that the guide, last updated 2026-05-04, already contains "starting June 01, 2026".) | https://developers.google.com/youtube/terms/revision-history |
| 9 | F2.4: individual vs organisation — *"Contradiction recorded — treat as unresolved"* | **Resolved** | Individuals explicitly accommodated: *"Are you applying: … **As an individual user**"*; *"Independent Developer/Sole Proprietor"*; *"If applying as an individual please write "self""*. Caveat: *"Your Organization's Primary Website"* is `aria-required="true"` even for individuals. | https://support.google.com/youtube/contact/yt_api_form |
| 10 | F2.3: form also handles quotas/audits; default 10,000 units/day; "must first complete an audit" | **Verified** | *"If you would like to request additional quota beyond the default allocation, you must first complete an audit to show that your project is in compliance with the YouTube API Services Terms of Service."* Default = *"10,000 units per day combined for all other endpoints"* (plus 100 `search.list`, 100 `videos.insert`). | https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits |
| 11 | F2.5: separate forms exist (Audited Developer Requests, Appeals, Periodic Audit, Change of Control) | **Verified** | All four named verbatim in the audits guide. | https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits |
| 12 | F3.1: form is per API Client; project numbers; "up to six project blocks" (F3.3) | **Corrected** | Live form: **10** project blocks (Project #1…#10), dropdown 1–10, and *"For more than 10 projects, please complete another form with the additional projects."* | https://support.google.com/youtube/contact/yt_api_form |
| 13 | F3.3: *"submit a separate form for each"* found only in the **Russian** variant | **Corrected** | It is in the **current English** form: *"This form is for one API Client only. If you have multiple clients, please submit a separate form for each one."* | https://support.google.com/youtube/contact/yt_api_form |
| 14 | F3.3: *"No primary source was found that states verbatim 'one user with several projects must apply per project'"*; per-project = *"safe assumption"* | **Upgraded to verified (scoped acceptance)** | The acceptance control is literally per project: ids `analytics_acknowledgement_1` … `_10`, each `data-depends-on="use_case_project_N:analytics"`. Acceptance does **not** appear to be a single client-wide act. No page *states in prose* that approvals don't transfer — that part remains inference. | https://support.google.com/youtube/contact/yt_api_form |
| 15 | F3.2: §III.D.1.c "exactly one (1) API Project" | **Verified verbatim** | Exact match, including *"you must not use that one (1) API Project for multiple API Clients."* | https://developers.google.com/youtube/terms/developer-policies |
| 16 | F3.4: BYO-key consequence | **Unsupported (unchanged)** | Still no official guidance on BYO-key/user-supplied credentials anywhere in the corpus. Draft's own "researcher inference" label stands. | — (absence of evidence) |
| 17 | F4.1: six metric families + headline examples | **Verified** | All six families and the quoted examples ("Creator Influence Score", "comment-to-view ratios", "Top YouTuber by View Growth", "36-month subscriber growth curves", Planning/Measuring split) match the live page. | https://developers.google.com/youtube/terms/derived-metrics-policy |
| 18 | F4.2: mapping to plugin metrics; policy lacks plugin vocabulary | **Verified (premise) / inference (mapping)** | The page indeed never uses "interaction rate"/"comment depth"/"publisher authority"/"recency-momentum"; the table remains inference. | https://developers.google.com/youtube/terms/derived-metrics-policy |
| 19 | F5.1/F5.4: 36-month allowance — *"publicly available stats"* **vs** *"metrics… from statistical endpoints"*; called *"Contradiction between retrievals of the same page"* | **Corrected — resolved as two different documents** | Both wordings are live, but on **different** pages: policy page says *"metrics (e.g., views, likes, subs count, comment counts) from statistical endpoints"*; the **form's accepted term 2** says *"publicly available stats (e.g., views, likes, comment counts)"*. The narrower "statistical endpoints" is the policy page; the broader is what you accept. | https://developers.google.com/youtube/terms/derived-metrics-policy · https://support.google.com/youtube/contact/yt_api_form |
| 20 | F5.1: titles/creator names/descriptions/comment text stay on 30-day rule | **Verified** | Policy page: *"must still follow the 30-day refresh and deletion policy in Section III(4)"*; form term 2 same. | both above |
| 21 | F5.2: §III.E.4.b/c/d text | **Verified** | Structure and wording match; §III.E.4 is the 4th item of §III.E, sub-list is `lower-alpha` (a–h). | https://developers.google.com/youtube/terms/developer-policies |
| 22 | F5.3: Authorized vs Non-Authorized definitions; API-key-only = Non-Authorized | **Verified** | §IV: *"Authorized Data" means API Data that an active user expressly authorizes … via User Credentials*; *"Non-Authorized Data" means API Data accessible by an API Client without User Credentials.* | https://developers.google.com/youtube/terms/developer-policies |
| 23 | F6.1: **§III.E.4.h** is the derived-data/metrics prohibition | **Verified — letter was correct** | §III.E.4 has exactly 8 subsections (a–h); (h) = *"must not (i) replace API Data with similar, independently calculated data, or (ii) access or use API Data to create new or derived data or metrics."* Also corroborated by revision history (Dec 18, 2017 entry) and by the form's own term 1. | https://developers.google.com/youtube/terms/developer-policies · https://developers.google.com/youtube/terms/revision-history |
| 24 | F6.1 (omission): amendment touches only E.4.h | **Corrected (draft omission)** | The amendment amends **§III.E.2.a (aggregation) and §III.E.4.h**. Draft never mentioned E.2.a. | https://support.google.com/youtube/contact/yt_api_form |
| 25 | F6.1: §III.E.4.h states no consequence | **Verified, and draft under-reported** | Correct that (h) itself states no consequence, but the **derived-metrics page carries one**: *"Violating these policies may result in API quota reduction or termination of your API access."* | https://developers.google.com/youtube/terms/derived-metrics-policy |
| 26 | F6.2: guide's *"don't create derived metrics…"* | **Verified verbatim** | Exact match. | https://developers.google.com/youtube/terms/developer-policies-guide |
| 27 | F6.3: ToS §3.1 quote | **Verified, with minor punctuation deviations in the draft** | Live: *"YouTube may suspend or terminate your access **to, or use of,** any aspect of the YouTube API Services (including any credentials assigned to you or your API Client(s)), impose additional requirements and restrictions, or terminate the Agreement between you and YouTube, for any violation of the Agreement by you, your API Client(s) or those acting on your behalf."* Draft wrote "to or your use of", "API Clients", "by those acting". | https://developers.google.com/youtube/terms/api-services-terms-of-service |
| 28 | F6.3: §24.2 / §24.3 | **Verified** | §24.2 (no obligation to give notice) and §24.3 (immediately stop; delete all API Data; certify deletion on request) match. | https://developers.google.com/youtube/terms/api-services-terms-of-service |
| 29 | F7.1: no personal/local/non-published carve-out | **Verified as a negative finding** | Exhaustive keyword search across 7 primary documents: no carve-out. | all sources |
| 30 | F7.3: form asks for demo/test account and link → practical friction | **Partly corrected** | *Primary Access URL* and *Privacy Policy URL* are **required** (`aria-required="true"`); the **demo username/password fields are NOT required** (no required marker found). So the friction is the mandatory public URLs, not the demo account. | https://support.google.com/youtube/contact/yt_api_form |
| 31 | Method note: *"no page-fetch tool … source_check not registered … all quotes should be re-verified"* | **Superseded** | Verification performed by `curl` on 2026-09-11 UTC; all 7 primary pages HTTP 200, none blocked. | — |

---

## 3. What is uncertain / not found

### (i) Verified primary-source facts

Fetched live 2026-09-11 (UTC); no page blocked curl; every primary page HTTP 200.

1. Acceptance lives in the **Audit and Quota Extension Form**, Section 5, as a **per-project** checkbox `analytics_acknowledgement_N` gated on selecting the **"Analytics & Reporting"** use case for that project; the checkbox links to Developer Policies §III.L.
2. The derived-metrics page's own cited path is *"Section 5: Use Cases, API Integration, and Feature Implementation"*, but the live form's Section 5 is **"Use Cases and Quota Extension Details"** and the string "Feature Implementation" is absent from the form.
3. The amendment's two accepted terms, verbatim (form term 1 amends **§III.E.2.a and §III.E.4.h**; form term 2 amends **§III.E.4.b, .c, .d**).
4. Developer Policies **§III.E.4 = "Refreshing, Storing, and Displaying API Data"**, subsections a–h; **(h)** is the derived-data/metrics prohibition — the draft's citation was right.
5. Developer Policies **§III.L = "Additional policies on derived metrics and data storage"** carries the "audited developers … standard quota extension request from (starting June 01, 2026)" sentence, as does the guide. **Not single-source.**
6. Guide second sentence: *"If you have not applied for this permission and/or your use case has not been approved, don't create derived metrics and/or store data beyond what is permitted in the developer policies."*
7. Derived-metrics page consequence sentence: *"Violating these policies may result in API quota reduction or termination of your API access."*
8. §III.D.1.c ("exactly one (1) API Project for that API Client"); §IV definitions of **Authorized Data** / **Non-Authorized Data**.
9. Baseline storage rules §III.E.4.b/c/d verbatim; default quota 10,000 units/day.
10. ToS §3.1 (suspension/termination), §24.2 (no obligation to give notice), §24.3 (immediately delete all API Data).
11. Individuals accommodated: *"As an individual user"*, *"Independent Developer/Sole Proprietor"*, *"If applying as an individual please write "self""*.
12. Multi-client/multi-project rules: *"This form is for one API Client only. If you have multiple clients, please submit a separate form for each one."*; **1–10** project blocks; *"For more than 10 projects, please complete another form with the additional projects."*
13. **No personal / local / private / non-published / non-commercial carve-out exists** in any fetched primary source. (Negative finding.)
14. **"Last updated" dates:** derived-metrics-policy **2026-06-01 UTC**; developer-policies **2026-06-24 UTC**; developer-policies-guide **2026-05-04 UTC**; api-services-terms-of-service **2026-04-28 UTC**; quota_and_compliance_audits **2026-09-04 UTC**; revision-history **2026-09-03 UTC**.
15. Revision history: Additional policies **added May 4, 2026**; **June 1, 2026** entry clarifies the >30-day storage allowance. This corroborates that "(starting June 01, 2026)" is a **policy effective date**.
16. Six permitted metric families with Google's own allowed/forbidden examples.

### (ii) Ambiguous, but primary

1. **36-month scope: "publicly available stats" (form) vs "metrics … from statistical endpoints" (policy page).** Both are live primary text; the operative accepted term is the broader one. Neither page defines "statistical endpoints". If the plugin's 36-month retention must be defensible under both, restrict 36-month retention to plainly public statistical values + derived metrics.
2. **Does an audit *precede* the amendment, or is it the same submission?** The policies say the amendment is *"only applicable to audited developers"*; the form's Section 1 offers only compliance-audit request types and states *"All requests for additional quota requests must go through a compliance audit."* Plain reading: **you cannot accept the amendment except as part of a compliance-audit request**, and the policies bind only audited/approved developers. Whether a *completed* audit must pre-exist the amendment acceptance (vs. the audit and acceptance happening in one submission and being approved together) is **not stated** on any page. The draft's "contradiction #1" (self-serve opt-in vs audited gate) is best explained as: you *self-serve into the audit request* — one submission — and the amendment then applies only if that audit/approval succeeds.
3. **(starting June 01, 2026):** the date matches the derived-metrics page's Last-updated exactly and corresponds to a revision-history entry, so it reads as the policy's operative date. But the guide containing it is last updated 2026-05-04 — *before* June 1 — which is internally odd. Treat the date as the policy's effective date, not as a change to the form route.
4. **Whether a project-level acceptance transfers.** The control is per project (`analytics_acknowledgement_N`), strongly implying no automatic transfer; but no prose states "approvals do not transfer across projects."
5. **What "audited developer" means operationally** (i.e. does it require a *passed* audit under the audits guide, or is any applicant in the audit pipeline an "audited developer"?) — not defined anywhere fetched.
6. **"Is your API Client publicly accessible? Yes / No"** — the form offers "No" but publishes no consequence or branch for that answer; a *Privacy Policy URL* is still required.

### (iii) Unsupported / not found

1. **No official guidance on bring-your-own-key / user-supplied-credential products** and how the amendment maps to that architecture. (Still the biggest open question for this plugin.)
2. **No published statement that approval is probable, typical, or time-bounded** — no acceptance rate, SLA, or review duration. The only "as soon as possible" language is *"A member of YouTube's API Services team will contact you as soon as possible."*
3. **No published minimum scale/traffic/subscriber/revenue threshold** for the amendment.
4. **No official definition** of how the amendment interacts with comment *text* for a "comment-depth" metric beyond the 30-day rule; **no published family** covering comment structure/depth at all.
5. **No personal / local / non-published use carve-out** (negative finding).
6. The draft's two third-party leads (`socialcrawl.dev` blog claim that analytics use cases are "routinely rejected"; Stack Overflow answers) remain **unverified and are not used** for any claim here.
7. The draft's *"English form offers up to six project blocks"* and *"the Russian variant says…"* claims are **superseded**: the English form itself now contains both instructions, and the count is 10.
8. **`yt_api_form`'s own "Last updated" line is not observable** from static HTML (it is a support-form page rendered by Google's Help Center; no footer date in the fetched markup). The form's field text is fully readable, but I cannot date the form revision.

---

## 4. Sources (all fetched live 2026-09-11 UTC, HTTP 200)

**Primary — used for every claim above**

1. Additional policies for derived metrics and data storage — https://developers.google.com/youtube/terms/derived-metrics-policy — owns the amendment preamble, the six metric families, the Data Storage paragraph ("statistical endpoints"), the quota-reduction warning; **Last updated 2026-06-01 UTC**.
2. YouTube API Services — Audit and Quota Extension Form — https://support.google.com/youtube/contact/yt_api_form — owns the request types (all audits), individual/organisation options, API Client definition, project-number mechanics (1–10, >10 = another form), the two amendment terms actually accepted, the per-project `analytics_acknowledgement_N` control, the "we will make a determination" note.
3. YouTube API Services — Developer Policies — https://developers.google.com/youtube/terms/developer-policies — owns §III.D.1.c, §III.E.2.a, §III.E.4 (a–h), §III.L, §IV definitions; **Last updated 2026-06-24 UTC**.
4. Complying with YouTube's Developer Policies — https://developers.google.com/youtube/terms/developer-policies-guide — owns the "audited developers" and "don't create derived metrics" sentences; **Last updated 2026-05-04 UTC**.
5. YouTube API Services Terms of Service — https://developers.google.com/youtube/terms/api-services-terms-of-service — owns §3.1, §12, §24.2, §24.3; **Last updated 2026-04-28 UTC**.
6. Quota and Compliance Audits — https://developers.google.com/youtube/v3/guides/quota_and_compliance_audits — owns the default 10,000 units/day baseline, the audit-first requirement, and the four companion forms; **Last updated 2026-09-04 UTC**.
7. YouTube API Services ToS — Revision History — https://developers.google.com/youtube/terms/revision-history — owns the May 4, 2026 / June 1, 2026 entries and the Dec 18, 2017 §III.E.4.h entry; **Last updated 2026-09-03 UTC**.

**Deprioritized / leads only — not used for any policy claim**

- `socialcrawl.dev` YouTube Data API 2026 post (vendor SEO content) and Stack Overflow Q79968865 / Q78801795 — seen only via the earlier draft; unverified; no authority.

---

## 5. Bottom line for the plugin

1. **There is no self-serve opt-in.** You accept the amendment by filing a **compliance-audit** request through the Audit and Quota Extension Form; the policies then apply *only* to **audited developers** whose analytics use case was **approved**, and there is a published consequence for acting without it (*"API quota reduction or termination of your API access"*).
2. **Acceptance is per project number** (`analytics_acknowledgement_N`), and the form is **one API Client per submission**. For a BYO-key plugin where each user holds their own project, the evidence points to **each user's project needing its own acceptance** — but Google publishes **nothing** on BYO-key products, so this remains the top unresolved architectural risk.
3. **Individuals are not excluded**: *"As an individual user"* and *"Independent Developer/Sole Proprietor"* are first-class options, and no scale/revenue/subscriber threshold exists. The friction is the **mandatory public Primary Access URL and Privacy Policy URL**, plus being describable as an "API Client".
4. **Design defensively regardless:** default to 30-day retention; treat anything beyond 30 days and any derived score as gated behind an explicit "amendment accepted for this project" acknowledgement; never retain titles, creator names, descriptions or comment text beyond 30 days; label scores as independently generated. Because the two live storage wordings differ ("statistical endpoints" vs "publicly available stats"), keep 36-month retention limited to clearly public statistical values and derived metrics.
5. **No personal/local-use exemption exists.** Do not plan around one.
