# Releasing

Two workflows, one direction of travel:

- `.github/workflows/ci.yml` — verifies. Runs on every push to `main`, every
  pull request, and every merge group. No secret, no publish.
- `.github/workflows/release.yml` — releases. Runs on every push to `main`.
  Bumps the version, tags, opens a GitHub Release, and publishes to npm.

## CI

`verify` runs `typecheck`, `node --test`, and `npm pack --dry-run` on two Node
versions: `22.19.0`, the `engines` floor, and `24`, the LTS. The floor is not
decorative — there is no build step (ADR 0003), so the runtime type-strips the
`.ts` sources itself, and a regression below the floor is a real breakage.

`tarball` then packs the artifact and uploads it. Because the package ships
sources and declares no build, `npm pack` *is* the build, so the artifact CI
inspects is byte-for-byte what npm would receive.

## Release

On a push to `main`, `release.yml` does two things in order:

1. **release-please** reads Conventional Commits since the last release tag and
   opens or updates a single **Release PR**. That PR is the only place a version
   changes: `package.json`, `package-lock.json`, and `CHANGELOG.md`.
   `CHANGELOG.md` is newest-first, so the new section lands directly under the
   `# Changelog` heading and the hand-written history below it is left alone.
2. **publish** waits for that job. When the Release PR was merged in this run,
   release-please has already created the tag and the GitHub Release; the job
   checks out that tag, runs the full gate (`npm run ci`), and publishes.

Publishing lives in the same file on purpose: a Release created with
`GITHUB_TOKEN` does not fire `on: release` in a separate workflow, so `needs:`
is the only reliable coupling.

The `publish` job refuses to guess. It fails if the tag and `package.json`
disagree, and it no-ops — successfully, with a notice — if that version is
already on the registry, so a re-run is safe.

### Version policy

Commit type decides the section and the bump:

| Commit | Changelog section | Bump, while major is 0 |
| --- | --- | --- |
| `feat:` | Added | minor |
| `fix:` | Fixed | patch |
| `perf:` | Performance | patch |
| `refactor:` | Changed | patch |
| `revert:` | Reverted | patch |
| `docs:` | Documentation | patch |
| `chore:` `ci:` `test:` `build:` `style:` | hidden | — |

`bump-minor-pre-major` is on, so a breaking change moves the minor
(`0.2.0 → 0.3.0`) rather than the patch. That matches how `0.1.4 → 0.2.0` was
treated, and it keeps `1.0.0` meaning something.

`include-component-in-tag` is off: the tag is `v0.3.0`, not `vibi-yt-v0.3.0`.

## One-time setup

### 1. npm trusted publisher

The package must already exist on the registry before trust can be configured —
`vibi-yt` does. On npmjs.com, open the package → **Settings** → **Trusted
publishing** → **GitHub Actions** and fill in:

| Field | Value |
| --- | --- |
| Organization or user | `fookhsu` |
| Repository | `vibi-yt` |
| Workflow filename | `release.yml` — filename only, case-sensitive |
| Environment name | leave blank; the workflow declares no environment |
| Allowed actions | tick **`npm publish`** |

Then publish from the workflow with **no token at all**. npm exchanges the
workflow's OIDC identity for a short-lived credential and attaches the
provenance attestation automatically — there is no `NPM_TOKEN` secret to create
and none to rotate. This is why `publish` carries `id-token: write`, and why the
job upgrades npm: trusted publishing needs npm `>= 11.5.1`, and the npm bundled
with Node 24 can be older.

If the environment is added to the workflow later, the same name has to be typed
into this table — the two are matched exactly, and a mismatch is a `403`.

### 2. Let Actions open the Release PR

While the action runs on the default `GITHUB_TOKEN`, this repository setting must
be on:

> **Settings → Actions → General → Workflow permissions →
> Allow GitHub Actions to create and approve pull requests**

**Optional upgrade.** Create a fine-grained PAT with `contents: write` and
`pull requests: write`, store it as the secret `RELEASE_PLEASE_TOKEN`, and the
action picks it up automatically — `release.yml` reads
`secrets.RELEASE_PLEASE_TOKEN || secrets.GITHUB_TOKEN`. Do this if you want the
Release PR to have real CI: `pull_request` runs triggered by `GITHUB_TOKEN` are
suppressed, so on the fallback path the Release PR arrives without checks. The
publish job's own gate still runs either way, so nothing unverified can reach
npm.

### 3. Bootstrap (once)

`package.json` is at `0.2.0`, but the newest tag is `v0.1.4` and npm's `latest`
is `0.1.4` — 0.2.0 was never released. `.release-please-manifest.json` is seeded
with `0.2.0` so release-please and `package.json` agree from the first run, and
0.2.0 gets its tag and its publish once, by hand.

The tag has to exist **before** these workflows first land on `main`: release-
please scopes the Release PR to the commits after the newest tag, so without
`v0.2.0` its first PR would re-announce the whole 0.2.0 rewrite as the next
release. So push the branch and the tag together:

```bash
git tag v0.2.0 1eddc51
git push origin main v0.2.0
```

(lightweight, like the `v0.1.4` tag and like the tags release-please creates)

Then give 0.2.0 the GitHub Release the hand-written changelog already describes,
and publish it through the ordinary publish job:

```bash
awk '/^## 0\.2\.0$/{f=1;next} /^## /{f=0} f' CHANGELOG.md > /tmp/vibi-yt-0.2.0.md
gh release create v0.2.0 --title v0.2.0 -F /tmp/vibi-yt-0.2.0.md
gh workflow run release.yml -f tag=v0.2.0
```

`workflow_dispatch` reads `release.yml` from the default branch and checks out
the tag you name, which is why the dispatch works even though `v0.2.0` predates
the workflow. Release-please owns every version after this one.

## Publishing by hand

`release.yml` also answers `workflow_dispatch`, with an optional tag. It is the
same job — check out the tag, run the gate, skip if already published — so use it
to retry a failed publish or to publish a tag whose run was lost.

## What stays manual

- **Merging the Release PR.** Nothing here merges it for you. The version on
  `main` is always a reviewed decision.
- **The bump itself.** It comes from commit messages, so a mislabeled commit
  produces a mislabeled release. Correct it by editing the Release PR before
  merging — that is exactly the window the PR exists to provide.
- **Unpublishing and deprecating.**
