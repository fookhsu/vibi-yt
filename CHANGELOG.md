# Changelog

All notable changes to this project will be documented in this file.

This project follows semantic versioning.

## [0.1.4] - 2026-09-11

### Fixed

- `auto-release.yml` wrote the `**Full Changelog**` footer as a literal `\n\n` instead of a blank line. `\n` is not expanded inside a double-quoted bash string, so the escape reached `gh release create --notes` verbatim. The footer only renders when an earlier `v*` tag exists, so the escape had gone unnoticed.
- `publish.yml` could race itself. The push-to-`main` run and the run dispatched by `auto-release.yml` landed in different concurrency groups, so both could pass the `npm view` check and both call `npm publish`. Every publish run now shares one constant concurrency group and serializes, and the second one exits through the existing `name@version` check.

### Changed

- Removed the `tags: ['v*.*.*']` and `release: types: [published]` triggers from `publish.yml`. They could never fire: `auto-release.yml` creates the tag and the release with `GITHUB_TOKEN`, and GitHub suppresses workflow runs for events raised by `GITHUB_TOKEN`. Release publishing is driven by the explicit `gh workflow run publish.yml` dispatch that `auto-release.yml` already issued.
- The repository moved from `fookhsu/vibi` to `fookhsu/vibi-yt`. Updated `repository`, `bugs`, and `homepage` in `package.json`, the README badges and links, and the repository references in `ROADMAP.md`. The project name stays `vibi`; only the repository moved. The npm Trusted Publisher entry must be updated to `fookhsu/vibi-yt` before a publish can succeed, because the OIDC identity is matched exactly.
- `docs/release.md` now describes the triggers that actually exist, names the repository explicitly in the one-time npm setup, and records why the tag and release triggers are absent.
- `README.md` credits [`eiei114/pi-youtube-tools`](https://github.com/eiei114/pi-youtube-tools), the native Pi extension this project generalizes, and `LICENSE` now names the copyright holder and carries the upstream notice. The previous `LICENSE` shipped the unedited `Copyright (c) 2026 YOUR_NAME` template.

## [0.1.2] - 2026-09-11

### Fixed

- The MCP server now reports the real package version in `serverInfo`. `readPackageVersion()` used a fixed `../../package.json` path, which resolved correctly from `adapters/mcp/server.ts` but pointed at a nonexistent `dist/package.json` once compiled, so 0.1.1 always advertised `0.0.0`. It now walks up to the nearest `package.json` and is independent of module depth.

### Added

- Version assertions in the MCP and packaging tests, so a module-depth regression cannot ship silently.

## [0.1.1] - 2026-09-11

### Fixed

- The MCP server and the library entrypoints now ship compiled JavaScript. Node refuses to strip TypeScript types for files under `node_modules` (`ERR_UNSUPPORTED_NODE_MODULES_TYPE_STRIPPING`), so `vibi-yt@0.1.0` failed for every installed consumer of `npx vibi-yt`, `import "vibi-yt"`, and `vibi-yt/adapters/portable`. The Pi extension was unaffected because Pi loads TypeScript through its own transpiler.

### Added

- `npm run build` compiles `dist/` from the TypeScript sources; `prepack` runs it so a publish cannot ship a stale build.
- A packaging smoke test packs the tarball, installs it under `node_modules/`, and drives the published entrypoints with plain Node.

## [0.1.0] - 2026-09-11

### Added

- YouTube Data API v3 tools: `youtube_search` for video discovery, `youtube_video_details` for metadata and statistics, and `youtube_transcript` for caption excerpts or capped full text.
- Agent-neutral tool core in `tools/`, with JSON Schema parameters and transport-neutral `{ text, data, isError }` outcomes.
- Pi adapter: native `registerTool()` integration plus `/youtube:login`, `/youtube:status`, and `/youtube:logout` commands.
- MCP adapter: dependency-free stdio server exposing the same tools to any MCP client, with the `vibi-mcp` binary.
- Portable adapter: `toToolDefinitions()`, `toOpenAiTools()`, and `toAnthropicTools()` for agents that use JSON function calling.
- Transcript diagnostics that report the attempted language, a reason code, and a suggested next action when captions are unavailable.
- Output guards that cap and compact tool responses for agent context windows.
- `docs/architecture.md`, `docs/adapters.md`, and `CONTEXT.md` describing the design, the adapter contract, and the project vocabulary.
