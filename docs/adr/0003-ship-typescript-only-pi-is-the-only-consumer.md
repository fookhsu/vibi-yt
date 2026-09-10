# Ship TypeScript only, and let Pi be the only consumer

**Status**: accepted

0.1.x shipped two artifacts: TypeScript sources for Pi (`pi.extensions → ./extensions`) and a compiled `dist/` with `main` / `types` / `exports` / `bin` for everything else, built by `tsc` and refreshed in `prepack`. v2 writes no second adapter — the map rules that out of scope — and Pi loads `.ts` files straight out of an installed package, so the compiled artifact has no consumer left. We decided to ship **TypeScript only**: no build step, no `dist/`, no `main` / `exports` / `bin`, and `engines.node` naming Pi's own floor (`>=22.19.0`) as the only runtime that exists.

## Considered options

- **TypeScript + dist, as 0.1.x did.** Rejected: it maintains a build chain for a consumer that does not exist, and buys two import styles in one repository, a stale-artifact risk, and a CI step in exchange.
- **dist only, with Pi loading compiled output.** Rejected: it gives up Pi's no-build `pi -e .` loop and makes "change a line, rebuild to try it" the daily rhythm.
- **Publish to npm and also present as a library** (`main` / `exports`). Rejected: there is no library consumer today.

## Consequences

- A future non-Pi host consuming this package from npm must build it first: Node refuses to strip types for files under `node_modules`. Adding `tsc` plus `prepack` at that point is a contained change — that is exactly how 0.1.4 acquired the build this ADR removes.
- The seam's portability now rests entirely on the contract (ADR 0002). If that contract is not enough to write a second adapter, the missing thing is the contract, not the compiled output.
- `engines.node` describes Pi's requirement rather than a lower bound of our own, which also unlocks `fetch`, `AbortSignal.timeout`, `node --test`, and type stripping without compatibility gymnastics.
- A contributor may reasonably try to add a build step. This ADR is the reason not to.
