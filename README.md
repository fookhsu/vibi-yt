# vibi-yt

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

Two independent credentials, resolved **per capability**:

| Capability | Credential |
| --- | --- |
| `youtube_search`, `youtube_video_details`, `youtube_transcript` | API key |
| `youtube_subscriptions` | OAuth authorization |

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

Security notes: credential values never enter the model context, tool output,
or the session log. `/youtube:status` reports sources and metadata only — never
a value.

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
  `<title>-<videoId>.jsonl` artifact. You receive a preview (the opening and
  closing 2,000-character windows) plus the path, and can read the file with
  your own file tool. Nothing is lost.
- A `detail: "compact"` result never spills; it returns the preview windows
  only.
- Every tool result carries the facts as fields: `truncated`, `spilled`,
  `preview`, and `records`. `truncated: true` means you did not receive the
  whole content and it is **not** retrievable from a spill file. A successful
  spill is not truncation.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `YOUTUBE_API_KEY` | API key (alternative to the stored key) |
| `YOUTUBE_OAUTH_CLIENT_JSON` | Path to the Google OAuth client JSON (supports `~`) |
| `YOUTUBE_OAUTH_REFRESH_TOKEN` | Refresh token for headless use (alternative to the token file) |
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

The architecture decisions live in `docs/adr/`; the vocabulary lives in
`CONTEXT.md`.

## Releasing

Every push to `main` is verified by CI on the `engines` floor (`22.19.0`) and
on the LTS, then packed into the same tarball npm would receive. When the push
carries Conventional Commits, [release-please][rp] opens a single Release PR:
the version in `package.json`, the lockfile, and `CHANGELOG.md` move together,
nothing else. Merging that PR is what tags the release and publishes it to npm
through [trusted publishing][tp] — OIDC, no `NPM_TOKEN`.

So a commit subject is load-bearing: it decides the changelog section and the
bump. `feat:` → Added, `fix:` → Fixed, `docs:` → Documentation; `chore:`, `ci:`,
`test:`, `build:`, and `style:` are hidden. See [docs/RELEASING.md](docs/RELEASING.md)
for the one-time setup, the version policy, and the manual publish path.

[rp]: https://github.com/googleapis/release-please
[tp]: https://docs.npmjs.com/trusted-publishers/

## License

MIT. The project continues the lineage of
[eiei114/pi-youtube-tools](https://github.com/eiei114/pi-youtube-tools) (MIT).
