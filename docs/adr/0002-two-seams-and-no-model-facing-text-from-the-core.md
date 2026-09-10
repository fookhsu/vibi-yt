# The seam is two seams, and the core returns no model-facing text

**Status**: accepted

`vibi-yt` 0.1.4 had one seam: an agent-neutral tool contract that returned `{ text, data, isError }`, with the host mapping that envelope onto its own result shape. Everything about authorization sat outside it — three `/youtube:key*` commands written directly into the Pi adapter — because authentication was then just reading a file. The rewrite adds OAuth, which is a state machine (loopback redirect, code exchange, refresh, `invalid_grant`, a 7-day expiry under Google's Testing status), and is meant to admit hosts beyond Pi. So we decided: **two seams** — tools, which the model invokes, and actions, which the user invokes — and **the core returns only structured data plus a set of render fields, never model-facing text**. Truncation is a field (`truncated`), not a marker string, and content past 8,000 characters is spilled to a JSONL artifact (`<title>-<videoId>.jsonl`) instead of being cut.

## Considered options

- **One seam, core returns `{ text, data }`** (0.1.4's shape, and the recommended default going in). Rejected: presentation belongs to the host, so the core should have no opinion about it.
- **Authorization as a model-callable tool.** Rejected: consent is the *user's* act — opening a browser and clicking allow is not a side effect a model should trigger.
- **Actions left to each host.** Rejected: that is one OAuth state machine per host, which defeats the seam.
- **Preview = first N characters, rather than the opening and closing windows.** Rejected: the hook/outro windows were 0.1.4's most durable idea, and with the full text on disk the preview can afford to be small.
- **A fixed artifact directory owned by the core.** Rejected: the core must not know any host's directory conventions, so the directory arrives via `ToolContext.artifactsDir`.

## Consequences

- The fact that content was cut can no longer be lost by a host that formats its own output: it is a boolean field, not a sentence a host may omit. Hosts still write the sentence.
- Every new host implements two mappings, not one, and must render `truncated` / `spilled` faithfully. A host that renders nothing useful is a bug in the host, not in the core.
- The context budget stays centralised: the threshold constant, the preview windows, and the spill mechanics live in the core, so no host gets to decide what "too long" means.
- Spilled artifacts accumulate in a directory the core does not own, which raises a cleanup question the core cannot answer alone (charted as a ticket on the map).

**Amendment (2026-09-11)**: `spilled` settled as `SpillInfo[]`, not a single object — `videoIds` is a list and `detail: "full"` applies to each entry, so one call can spill several videos.
