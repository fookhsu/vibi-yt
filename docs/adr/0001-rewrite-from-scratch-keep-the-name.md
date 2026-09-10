# Rewrite from scratch, keeping the vibi-yt name and repository

**Status**: accepted

`vibi-yt` 0.1.x — a single-commit history, released through 0.1.4 — shipped an API-key-only YouTube tool set (search, video details, transcript) behind three adapters (Pi, MCP stdio, portable JSON). The next version adds an OAuth path, because listing subscriptions requires user authorization, and an adapter seam meant to admit hosts beyond Pi. We decided to rewrite rather than evolve: no code from 0.1.4 is restored, only its design lessons; the name and the repository stay `vibi-yt`; and a new initial commit replaces `main`.

## Considered options

- **Evolve in place** — restore `lib/` and `tools/` from 0.1.4 and redesign the adapters and auth layer around them. Rejected: 0.1.4's layering assumes exactly one credential, an API key resolved once. Adding per-user OAuth credentials to that means two auth models coexisting in one tree, and a half-restored core makes every later change argue with a design nobody chose.
- **New repository and package name** — leave `vibi-yt` frozen at 0.1.4. Rejected: the published npm name and the project identity would fork, and the thing being built still *is* vibi-yt, just rewritten.
- **Greenfield in the same repository** (chosen) — one identity, one place, and a seam designed for the auth model it will actually carry.

## Consequences

- `main` no longer contains the 0.1.4 tree, so the published package's source is no longer on the default branch. It stays reachable at tag `v0.1.4`, which is the durable pointer to keep.
- The three existing capabilities (search, video details, transcript) are re-derived rather than copied: their contracts re-open as decisions instead of being inherited.
- 0.1.x's commit history and reflog are gone locally; nothing but the tag preserves that lineage.

## Context

The way this rewrite came about — the destination, the settled decisions, and the open ones — is charted in the map issue (#1) on this repository's tracker.
