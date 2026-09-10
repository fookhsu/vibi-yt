# Roadmap

Maintenance roadmap for **vibi** — a YouTube Data API v3 tool set (`youtube_search`,
`youtube_video_details`, `youtube_transcript`) with an agent-neutral core and three
adapters: a native Pi extension, an MCP stdio server, and portable JSON tool
definitions.

This file is maintainer-facing context. It is **not** shipped in the npm tarball
(see `package.json` `files`). Its job is to give the weekly maintenance seed
planner a bounded list of next micro-tasks without re-discovering project state
each run.

Update this file whenever a release ships or a seed is completed.

---

## Current status

| Item | Value |
|---|---|
| npm package | `vibi-yt` |
| Version | **0.1.4** (2026-09-11) |
| Tools | `youtube_search`, `youtube_video_details`, `youtube_transcript` |
| Commands | `/youtube:key`, `/youtube:key:set`, `/youtube:key:clear` |
| Repository | `github.com/fookhsu/vibi-yt` |
| Adapters | `tools/` core + `adapters/pi`, `adapters/mcp`, `adapters/portable.ts` |
| Transports | Pi in-process · MCP stdio (`vibi-mcp`) · portable JSON |
| Auth | `YOUTUBE_API_KEY` env var → stored key (`~/.pi/agent/vibi-auth.json`, mode 600) |
| Transcript dep | `youtube-transcript-plus` ^1.1.2 |
| Node runtime | `engines.node` **>= 20**; the standalone MCP server needs >= 22.18 |
| CI | Node 22, `npm run ci` = typecheck + `node --test` + `npm pack --dry-run` |
| Publishing | npm Trusted Publishing (OIDC), `auto-release.yml` → `publish.yml`, no `NPM_TOKEN` |
| Dependency hygiene | Dependabot weekly (npm + github-actions), grouped minor/patch |

### Project identity

| Item | Value |
|---|---|
| GitHub owner | `fookhsu` |
| npm name | `vibi-yt` |

The remaining manual step before the OIDC publish path can work is configuring
the npm Trusted Publisher for `vibi-yt` (repository `fookhsu/vibi-yt`, workflow
`publish.yml`). See `docs/release.md`.

---

## Priorities (north star)

1. **One implementation, many agents.** Changes belong in `tools/` or `lib/`.
   Adapters stay translation-only — see `docs/architecture.md` for the
   dependency rule.
2. **Agent-context-friendly output.** Caps and truncation protect the model's
   context window and terminal buffer limits. Do not regress them.
3. **Safe, local auth.** The API key never reaches the model. Keep the
   env-var → stored-file precedence and the secret-safe status command.
4. **Low-friction maintenance.** Dependabot + Trusted Publishing + the
   `version:check` PR guard should keep the release pipeline self-service.

---

## Known technical debt

| ID | Area | Debt | Risk | Status |
|---|---|---|---|---|
| TD-1 | resilience | No request timeout / `AbortController` in `lib/youtube-api.ts` or `lib/transcript.ts` | Hung upstream stalls the tool | open |
| TD-2 | deps | `youtube-transcript-plus` 1.x → 2.x | Misses upstream retry/backoff | open |
| TD-3 | types | `TranscriptResult` is a disguised union: `text` vs `hook`/`outro` are chosen by `format` at runtime | Invalid states are representable; readers must check `format` | open |
| TD-4 | docs | No `docs/troubleshooting.md` for 403/quota/caption failures | Users and agents lack failure playbooks | open |
| TD-5 | tests | No formatter snapshot tests for truncation markers | Output-shape regressions hard to spot | open |
| TD-6 | docs | `docs/examples.md` has no multi-video end-to-end example | Onboarding gap for multi-tool workflows | open |
| TD-7 | mcp | Tools declare no `outputSchema`, so `structuredContent` is advisory | Clients cannot validate `data` | open |
| TD-8 | adapters | No adapter for a specific host beyond Pi/MCP/portable | Integration gaps for other agent SDKs | open |

---

## Candidate maintenance seeds

Each seed is bounded to **30–90 minutes**, has explicit acceptance criteria, and
maps to a real item above. The weekly seed planner can promote any of these into
a backlog issue. Seeds are independent unless noted.

> Convention: a seed is **done** when `npm run ci` is green, the change is behind
> a PR, and the acceptance bullets below are satisfied. No seed here requires a
> production action or a manual npm publish — those stay human-owned.

### S-1 · Add request timeouts to `lib/youtube-api.ts` *(code+tests, ~60–90 min)*

**Fixes:** TD-1 (API side)

- Accept a `timeoutMs` option and wrap `fetchFn` with `AbortSignal.timeout()`.
- Surface a timeout as a `YoutubeApiError` whose message names the timeout.
- Add a test with a `fetchFn` that rejects on abort.

### S-2 · Add request timeouts to `lib/transcript.ts` *(code+tests, ~60 min)*

**Fixes:** TD-1 (transcript side)

- Thread a timeout through `TranscriptOptions` into the injected fetcher.
- Classify an aborted fetch as `network_or_upstream_error` so the diagnostic
  still carries a next action.
- Extend `tests/transcript.test.mjs` with the abort case.

### S-3 · Make `TranscriptResult` a discriminated union *(code+tests, ~45 min)*

**Fixes:** TD-3

- Split into `{ format: "full_text"; text: string }` and
  `{ format: "excerpt"; hook: string; outro: string }`.
- Update `toTranscriptResult`, `formatTranscriptMap`, and
  `compactTranscriptDetails` to narrow on `format`.
- `npm run typecheck` must pass with no new casts.

### S-4 · Document failure playbooks *(docs, ~60 min)*

**Fixes:** TD-4

- Add `docs/troubleshooting.md` covering 403 quota errors, missing API keys,
  unavailable captions, and the transcript diagnostic reason codes.
- Link it from the README documentation table.

### S-5 · Configure npm Trusted Publishing for `vibi-yt` *(manual, ~15 min)*

**Fixes:** no release has yet gone out through OIDC trusted publishing. 0.1.0–0.1.2
were published without provenance, and the repository rename to `fookhsu/vibi-yt`
invalidates any Trusted Publisher entry that still names the old repository.

- On npmjs.com, add a Trusted Publisher: GitHub Actions, repository
  `fookhsu/vibi-yt`, workflow filename `publish.yml`, environment empty.
- Verify with a dry run: `npm pack --dry-run` should produce `vibi-yt-0.1.4.tgz`.
- Human-owned; do not attempt to automate npm account changes.

---

## Improvement areas

- **Resilience** — timeouts and retry on both outbound paths.
- **Type safety** — remove representable-invalid states from transcript results.
- **Docs** — a `docs/troubleshooting.md` playbook, and a "add a new tool" section
  in `CONTRIBUTING.md`.
- **MCP completeness** — declare `outputSchema` where the `data` payload is stable.
- **Adapters** — one file per new host; no changes to `tools/` should be needed.
