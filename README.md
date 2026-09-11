# vibi-yt

**English** | [简体中文](README.zh-CN.md)

Read-only YouTube capabilities for coding agents, as **tools** for the model and
**actions** for you. Pi is the only consumer today.

- `youtube_search` — find videos by keyword
- `youtube_video_details` — metadata and statistics for one to ten videos
- `youtube_transcript` — the caption track of one to ten videos
- `youtube_subscriptions` — the channels **you** are subscribed to (needs authorization)

Everything is read-only. There is no way to subscribe, comment, or upload.

## Install

Requires Node `>=22.19.0` (Pi's own floor).

```bash
pi install npm:vibi-yt
# or
pi install git:github.com/fookhsu/vibi-yt
```

## Credentials

Two independent credentials, resolved **per capability** — with one capability
that needs neither:

| Capability | Credential |
| --- | --- |
| `youtube_search`, `youtube_video_details` | API key |
| `youtube_subscriptions` | OAuth authorization |
| `youtube_transcript` | none — see [Transcripts](#transcripts) |

There is no automatic fallback between them: a missing API key is never
silently satisfied by an OAuth token.

### API key

Create an API key in a Google Cloud project with **YouTube Data API v3**
enabled, then either:

```bash
export YOUTUBE_API_KEY="..."
```

or run `/youtube:set-api-key` in Pi. The stored key lives at
`<agentDir>/vibi-auth.json` with mode `0600` (`agentDir` is `getAgentDir()`,
so `PI_CODING_AGENT_DIR` relocates it).

### OAuth (for subscriptions)

1. In Google Cloud, create an **OAuth client**. Either type works:
   - `installed` (Desktop app): the plugin binds an ephemeral loopback port.
   - `web`: the redirect must exactly match a registered value. The default is
     `http://localhost:6969`; override it with `YOUTUBE_OAUTH_REDIRECT_URI`.
2. Put the downloaded client JSON somewhere and point the plugin at it:

   ```bash
   export YOUTUBE_OAUTH_CLIENT_JSON=/path/to/client_secret.json
   ```

   Without the env var, the plugin looks for
   `<agentDir>/vibi-oauth-client.json`. The file is read in place — it is never
   copied.
3. Run `/youtube:authorize`. The plugin opens your browser, waits for the
   loopback callback (up to two minutes), and if the callback cannot reach the
   process, asks you to paste the callback URL.

The token is written to `<agentDir>/vibi-oauth-token.json` (mode `0600`). The
access token is refreshed automatically about a minute before it expires; the
refresh token is only ever considered dead when Google says `invalid_grant`.

On a headless or remote machine, set `YOUTUBE_OAUTH_REFRESH_TOKEN` rather than
copying the token file over. It takes precedence over the token file, and the
client JSON from step 1 is still required — the refresh exchange needs it.

Security notes: credential values never enter the model context, tool output,
or the session log. `/youtube:status` reports sources and metadata only — never
a value.

### Transcripts

`youtube_transcript` needs no credential at all. It reads the caption track
through the same unofficial player endpoint yt-dlp uses, not the Data API (see
[Quotas and limits](#quotas-and-limits)). An API key is consulted only to look up
video titles for spill filenames, so with nothing configured transcripts still
work — spill files are just named `transcript-<videoId>.jsonl` instead of
`<title>-<videoId>.jsonl`.

## Commands

| Command | What it does |
| --- | --- |
| `/youtube:authorize` | Start the OAuth flow (loopback + browser) |
| `/youtube:deauthorize` | Revoke at Google, then delete the local token |
| `/youtube:status` | Credential sources and authorization state, without values |
| `/youtube:set-api-key` | Store an API key |
| `/youtube:clear-api-key` | Delete the stored API key |

## Context budget

Long content does not get silently cut:

- A `detail: "full"` result over **8,000 characters** is written to a
  `<title>-<videoId>.jsonl` artifact — the title falls back to `transcript` when
  no API key is configured. The model gets a preview (the opening and
  closing 2,000-character windows) plus the path, and reads the file with its
  own file tool. Nothing is lost.
- A `detail: "compact"` result never spills; it returns the preview windows
  only.
- Every tool result carries the facts as fields: `truncated`, `spilled`,
  `preview`, and `records`. `truncated: true` means the model did not receive
  the whole content and it is **not** retrievable from a spill file. A
  successful spill is not truncation.

## Quotas and limits

- **Quota is finite, and `search` is the expensive one.** A Google Cloud project
  gets 10,000 YouTube Data API v3 units per day by default, and `search.list`
  has historically been metered at 100 units per call — 100 searches is a day's
  budget. Newer projects may instead see `search.list` capped as its own
  100-calls-per-day bucket. Either way: search sparingly. This is not a bulk
  crawler.
- **Transcripts are the weak point, and not by choice.** The Data API does
  expose captions, but `captions.download` requires permission to *edit* the
  video — so it only reads back captions on videos you own — and
  `captions.list` returns track metadata, never the text. With no official
  endpoint for someone else's transcript, `youtube_transcript` reads the caption
  track the way yt-dlp does, and inherits the breakage when YouTube changes the
  player or the timedtext endpoint. The other three capabilities use the
  documented API and do not.
- **Ten at a time.** Search returns at most 10 results with no pagination;
  details and transcripts take at most 10 IDs per call.
- **Not every video has captions, and not every language is present.**
  `youtube_transcript` returns `transcript_unavailable` along with the languages
  it did find.

## vibi-yt and yt-dlp

[yt-dlp][yd] is the reference tool for getting media *out* of YouTube. vibi-yt
downloads nothing, and its unit of work is a tool call whose result lands in the
model's context — not a file on disk.

They are not competitors, and the overlap is worth stating bluntly: for most of
what people mean by "get me this video", and for anything beyond these four
capabilities — playlists, channels, comments, formats, live chat, or a site that
is not YouTube — yt-dlp is the tool. Use yt-dlp when the output is a file; use
vibi-yt when the output is a tool result.

The head-to-head, including where yt-dlp wins, is
[ADR 0004](docs/adr/0004-implement-the-capabilities-instead-of-shelling-out-to-yt-dlp.md).

[yd]: https://github.com/yt-dlp/yt-dlp

## Environment variables

| Variable | Purpose |
| --- | --- |
| `YOUTUBE_API_KEY` | API key (alternative to the stored key) |
| `YOUTUBE_OAUTH_CLIENT_JSON` | Path to the Google OAuth client JSON (supports `~`) |
| `YOUTUBE_OAUTH_REFRESH_TOKEN` | Refresh token for headless use (takes precedence over the token file) |
| `YOUTUBE_OAUTH_REDIRECT_URI` | Registered redirect for a `web` client |

`PI_CODING_AGENT_DIR` relocates the agent directory, and therefore all three
credential files.

## Development

No build step: the package ships TypeScript and Pi loads it directly.

```bash
npm install
npm run typecheck
npm test
npm run ci        # typecheck + tests + pack check
pi -e .           # try it from the working tree
```

CI runs `npm run ci` on the `engines` floor (`22.19.0`) and on the LTS, so a
green local `npm run ci` is the minimum for a pull request.

Read `CONTEXT.md` before naming anything: its vocabulary is normative, and a
concept that already has a word there should not arrive under a second one. The
ADRs are constraints rather than history — ADR 0003 is why there is no build
step, ADR 0002 is why the core returns no model-facing text. If you need a new
word, add it to `CONTEXT.md` first.

## Releasing

Commit subjects are load-bearing: releases are cut from Conventional Commits, so
`feat:` moves the minor and lands under **Added**, `fix:` under **Fixed**,
`docs:` under **Documentation**, and `chore:`, `ci:`, `test:`, `build:`, and
`style:` stay out of the changelog.

Version policy, the one-time npm setup, and the manual publish path live in
[docs/RELEASING.md](docs/RELEASING.md).

## License

MIT. The project continues the lineage of
[eiei114/pi-youtube-tools](https://github.com/eiei114/pi-youtube-tools) (MIT).
