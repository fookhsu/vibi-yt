# Changelog

## [0.2.1](https://github.com/fookhsu/vibi-yt/compare/v0.2.0...v0.2.1) (2026-09-11)


### Documentation

* name the video discovery domain ([af2cb5f](https://github.com/fookhsu/vibi-yt/commit/af2cb5f56366162808e3f9d7e4b689e81d8501fd))

## 0.2.0

A ground-up rewrite of `vibi-yt` around two seams and a read-only YouTube
capability set. Breaking relative to 0.1.x.

### Added

- **`youtube_subscriptions`** — list the channels the user is subscribed to.
  Requires OAuth authorization; there is no newest-first order.
- **OAuth authorization** with a loopback redirect and PKCE:
  `/youtube:authorize`, `/youtube:deauthorize`, `/youtube:status`,
  `/youtube:set-api-key`, `/youtube:clear-api-key`.
- **Context budget**: results over 8,000 characters spill to a
  `<title>-<videoId>.jsonl` artifact, and every result carries explicit
  `truncated`, `spilled`, `preview`, and `records` render fields.
- **Structured failures**: a closed set of failure codes, each with an
  executable hint and a `retryable` boolean.

### Changed

- The single `{ text, data, isError }` tool envelope is replaced by the two
  seams: tools for the model (`data` + render fields) and actions for the user.
  Hosts render; core returns no model-facing text.
- `videoId` is gone; every tool takes `videoIds: string[]` (up to 10).
- `includeDescription` and `format: excerpt|full_text` are absorbed into
  `detail: "compact" | "full"`.
- Credentials resolve per capability: subscriptions use OAuth only, the other
  tools prefer the API key, with no automatic fallback.

### Removed

- The MCP adapter and the portable-JSON adapter. Pi is the only consumer.
- The build step. The package ships TypeScript and declares no `main`,
  `types`, `exports`, or `bin`.

## 0.1.4

The previous single-commit line: `youtube_search`, `youtube_video_details`,
and `youtube_transcript` behind Pi, MCP stdio, and portable-JSON adapters,
with an API key resolved once.
