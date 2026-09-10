# vibi

[![CI](https://github.com/fookhsu/vibi-yt/actions/workflows/ci.yml/badge.svg)](https://github.com/fookhsu/vibi-yt/actions/workflows/ci.yml)
[![Publish](https://github.com/fookhsu/vibi-yt/actions/workflows/publish.yml/badge.svg)](https://github.com/fookhsu/vibi-yt/actions/workflows/publish.yml)
[![npm version](https://img.shields.io/npm/v/vibi-yt.svg)](https://www.npmjs.com/package/vibi-yt)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Pi package](https://img.shields.io/badge/pi-package-purple.svg)](https://pi.dev/packages)

> YouTube search, video metadata, and transcripts — as a Pi extension, an MCP server, or portable tool definitions.

## What this is

**vibi** defines three YouTube tools once, in an agent-neutral core, and projects them onto whichever agent you use:

- **Pi** — a native extension that registers the tools via `registerTool()`; no daemon, auth stays local.
- **MCP** — a dependency-free stdio server for Claude Code, Cursor, Codex, or any other MCP client.
- **Anything else** — portable JSON tool definitions for OpenAI/Anthropic-style function calling.

Every adapter shares the same implementation, output guards, and auth resolution, so behaviour stays identical across agents.

See [`docs/architecture.md`](docs/architecture.md) for the design and [`docs/adapters.md`](docs/adapters.md) for the tool contract.

## Tools

| Tool | Purpose |
|---|---|
| `youtube_search` | Search videos by query (default 5 results, max 10) |
| `youtube_video_details` | Title, channel, stats, optional truncated description |
| `youtube_transcript` | Fetch captions as a hook/outro excerpt or capped full text |

### Slash commands

| Command | Purpose |
|---|---|
| `/youtube:key` | Secret-safe check of whether an API key is configured |
| `/youtube:key:set` | Enter and store a YouTube Data API key via Pi UI |
| `/youtube:key:clear` | Remove the stored API key (does not unset `YOUTUBE_API_KEY`) |

The bare command is the read-only status check; changing the key requires an
explicit verb.

## Install

```bash
pi install npm:vibi-yt
```

Or install from GitHub:

```bash
pi install git:github.com/fookhsu/vibi-yt
```

## Use with other agents

The same three tools are exposed through two extra adapters. Auth resolution is shared: set `YOUTUBE_API_KEY`, or reuse a key stored by `/youtube:key:set`.

### MCP (Claude Code, Cursor, Codex, ...)

The package ships a dependency-free MCP stdio server. Point any MCP client at it:

```json
{
  "mcpServers": {
    "youtube": {
      "command": "npx",
      "args": ["-y", "vibi-yt"],
      "env": { "YOUTUBE_API_KEY": "your_google_api_key" }
    }
  }
}
```

Run it directly for protocol debugging:

```bash
npx -y vibi-yt
```

> The server ships as compiled JavaScript, so any Node.js >= 20 works. The Pi
extension loads the TypeScript sources through Pi's own transpiler.

### Portable JSON (OpenAI / Anthropic / custom agent loops)

```js
import { toOpenAiTools, toAnthropicTools, executeYoutubeTool } from "vibi-yt/adapters/portable";

const tools = toOpenAiTools();                      // OpenAI-style function tools
// const tools = toAnthropicTools();                // Anthropic input_schema shape

const outcome = await executeYoutubeTool("youtube_search", { query: "lo-fi beats" });
// -> { text, data, isError? }
```

The agent-neutral core imports without any agent SDK:

```js
import { youtubeTools, findYoutubeTool, executeYoutubeTool } from "vibi-yt";
```

## API key setup

You need a [YouTube Data API v3](https://developers.google.com/youtube/v3) key.

**Auth precedence** (first match wins):

1. `YOUTUBE_API_KEY` environment variable
2. Key stored by `/youtube:key:set` in `~/.pi/agent/vibi-auth.json` (mode 600)

Configure with either method:

```txt
/youtube:key:set
```

```powershell
$env:YOUTUBE_API_KEY="your_google_api_key"
```

Check configuration:

```txt
/youtube:key
```

`/youtube:key` reports configured or missing only — it never prints the key. `/youtube:key:clear` clears the stored file; an environment variable still takes precedence on the next run.

## Typical workflow

1. **Discover** — `youtube_search` with a topic or game name.
2. **Inspect** — `youtube_video_details` for one or more `videoId` values from search results.
3. **Read captions** — `youtube_transcript` when spoken content matters.

`youtube_transcript` defaults to `excerpt` (intro hook + outro) to save tokens. Use `format: full_text` only when you need more of the transcript. When captions are unavailable, `details.transcripts[videoId]` stays `null` and `details.transcriptDiagnostics[videoId]` explains the attempted `lang`, a conservative reason code, and whether to retry, switch language, or choose another video.

See [`docs/examples.md`](docs/examples.md) for copy-paste examples.

## Output guards

Tool responses are formatted for LLM context and terminal buffer limits:

- Overall tool text is capped at **12,000** characters.
- Search results default to **5** items (max **10**); titles, channels, and snippets are compacted.
- Descriptions are truncated to **300** characters when `includeDescription` is true.
- Transcripts use **8,000** characters for full text or **2,000** per hook/outro segment.

Truncated sections end with a `[truncated N chars]` marker.

## Quick start (local)

```bash
pi -e .
```

```txt
/youtube:key:set
/youtube:key
```

Then ask Pi to search YouTube, fetch video details, or read a transcript.

## Package layout

| Path | Purpose |
|---|---|
| `tools/` | Agent-neutral tool specs: JSON Schema parameters + pure handlers |
| `adapters/` | Per-agent projections: `pi/`, `mcp/`, `portable.ts` |
| `extensions/` | Pi package entrypoint (thin re-export of `adapters/pi/`) |
| `lib/` | YouTube API client, auth, formatters, transcript helpers |
| `dist/` | Compiled JavaScript + type declarations — the runtime artifact |
| `bin/` | MCP stdio server executable |
| `docs/` | Architecture, adapter, example, and release docs |

## Documentation

| Document | Contents |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | Layers, dependency rule, design decisions, testing |
| [`docs/adapters.md`](docs/adapters.md) | Tool contract and how to add an adapter |
| [`CONTEXT.md`](CONTEXT.md) | Project vocabulary |
| [`docs/examples.md`](docs/examples.md) | Copy-paste workflow examples |
| [`docs/release.md`](docs/release.md) | Trusted Publishing setup and release handoff |

## Development

The package is authored in TypeScript. `dist/` is generated and is what plain
Node.js consumes (the `bin` and the `exports` map both point at it), so build
after changing sources.

```bash
npm install
npm run build
npm run ci
```

`npm test` and `npm publish` build automatically via `pretest` / `prepack`.

## Release

This package uses npm Trusted Publishing (no `NPM_TOKEN` required).

```bash
npm version patch
git push
```

After merge to `main`, `auto-release.yml` creates the semver tag and GitHub release, then dispatches `publish.yml` for npm publication.

See [`docs/release.md`](docs/release.md) for setup details and how to verify the tag → publish handoff.

## Security

Pi packages can execute code with your local permissions. Review extensions before installing third-party packages.

Never commit or log `YOUTUBE_API_KEY`. `/youtube:key:set` stores keys locally and the extension UI handles the secret without sending it to the model.

For vulnerability reporting, see [`SECURITY.md`](SECURITY.md).

## Links

- npm: https://www.npmjs.com/package/vibi-yt
- GitHub: https://github.com/fookhsu/vibi-yt
- Issues: https://github.com/fookhsu/vibi-yt/issues

## Credits

This project builds on [**eiei114/pi-youtube-tools**](https://github.com/eiei114/pi-youtube-tools) (MIT) — a native Pi extension for YouTube Data API search, video details, and transcripts without an MCP daemon. vibi-yt generalizes that work into an agent-neutral core, so the same three tools also run over MCP and as portable JSON tool definitions.

## License

MIT
