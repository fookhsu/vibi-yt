# Release

This package uses npm Trusted Publishing with GitHub Actions OIDC.

Do not add `NPM_TOKEN` or long-lived npm tokens to GitHub Secrets.

## Workflows

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `ci.yml` | Push or PR | Run `npm run ci` (typecheck, tests, pack dry-run) |
| `auto-release.yml` | Push to `main` when `package.json` changes | Create `v<version>` tag and GitHub release, then dispatch `publish.yml` |
| `publish.yml` | Push to `main` that changes `package.json`/`package-lock.json`, or manual dispatch | Publish to npm with Trusted Publishing (OIDC) |

## One-time npm setup

On npmjs.com, configure Trusted Publishing for this package:

- Publisher: GitHub Actions
- Repository: `fookhsu/vibi-yt`
- Workflow filename: `publish.yml`
- Environment: leave empty

The repository and workflow filename must match this run's OIDC identity exactly.
Renaming the GitHub repository — or editing `publish.yml` away — invalidates the
entry, and `npm publish` then fails even though the package exists.

## Publish

```bash
npm version patch
git push
```

On `main`, `.github/workflows/auto-release.yml` checks whether `package.json` version changed. If `v<version>` does not exist yet, it creates the tag, creates the GitHub Release, then explicitly dispatches `.github/workflows/publish.yml` for that tag.

`npm publish` runs `prepack`, which builds `dist/`. `dist/` is generated and is not committed, but it is what `bin` and `exports` point at — so never publish with a hand-edited `dist/`, and never remove `dist/` from `files`.

`publish.yml` intentionally has **no** `tags:` or `release:` trigger. `auto-release.yml`
creates the tag and the GitHub Release with `GITHUB_TOKEN`, and GitHub suppresses
workflow runs for events raised by `GITHUB_TOKEN` — so those triggers could never
fire. Publishing is driven by the explicit `gh workflow run publish.yml` dispatch,
by the push-to-`main` trigger above, and by manual `workflow_dispatch`.

Because the push trigger and the dispatch can both start a run for the same
version, `publish.yml` uses a single constant concurrency group so the runs
serialize. The second one then exits through the `name@version` check below.

The workflow skips `name@version` if that exact package version already exists on npm.

## Verify tag → publish handoff

After merging a version bump to `main`:

1. Open **Actions → Auto Release** and confirm the run created `v<version>`.
2. Open **Actions → Publish to npm** and confirm a run started for the same tag (from the explicit dispatch).
3. Confirm npm shows the new version at `https://www.npmjs.com/package/vibi-yt`.

## GitHub Actions requirements

- `permissions: id-token: write` on `publish.yml`
- `permissions: actions: write` on `auto-release.yml` so it can dispatch `publish.yml`
- GitHub-hosted runner
- Node.js 24, so the publish job uses a current npm CLI for Trusted Publishing
- No `NPM_TOKEN`
- `npm publish` from the configured workflow file

## First release checklist

- [ ] `package.json` name is final
- [ ] `repository.url` points to the real GitHub repository
- [ ] npm Trusted Publisher is configured
- [ ] `npm run ci` passes
- [ ] `npm pack --dry-run` contains only intended files
- [ ] `CHANGELOG.md` has the release date
