# Releasing

Three workflows, one direction of travel:

- `.github/workflows/ci.yml` — verifies. Runs on every push to `main`, every
  pull request, and every merge group. No secret, no publish.
- `.github/workflows/release.yml` — versions. Runs on every push to `main`.
  Turns Conventional Commits into a Release PR, and merges into a tag.
- `.github/workflows/publish.yml` — publishes. Runs only when dispatched.

## CI

`verify` runs `typecheck`, `node --test`, and `npm pack --dry-run` on two Node
versions: `22.19.0`, the `engines` floor, and `24`, the LTS. The floor is not
decorative — there is no build step (ADR 0003), so the runtime type-strips the
`.ts` sources itself, and a regression below the floor is a real breakage.

`tarball` then packs the artifact and uploads it. Because the package ships
sources and declares no build, `npm pack` *is* the build, so the artifact CI
inspects is byte-for-byte what npm would receive.

## Release

On a push to `main`, `release.yml` does one thing: **release-please** reads the
Conventional Commits since the last release tag and opens or updates a single
**Release PR**. That PR is the only place a version changes — `package.json`,
`package-lock.json`, and `CHANGELOG.md` together. `CHANGELOG.md` is newest-first,
so the new section lands directly under the `# Changelog` heading and the
hand-written history below it is left alone. Merging the PR is what creates the
tag and the GitHub Release, so no version reaches `main` unreviewed.

### Why publishing is a separate file

The obvious design is one file: `release-please` output feeding a `publish` job
through `needs:`. It is the design that is written, deleted, and re-derived
every time someone sets this up, and it is wrong here for one specific reason.

**npm's trusted publisher is configured per workflow filename, and it already
trusts `publish.yml`.** Renaming the file to `release.yml` — or folding publish
into it — does not fail in review, on `main`, or in CI. It fails at the last
step of a release, as `403 npm-trusted-publisher-not-configured`, after the tag
and the GitHub Release already exist.

So `release.yml` reaches `publish.yml` the only way a `GITHUB_TOKEN`-driven run
can: an explicit `gh workflow run publish.yml --ref main -f ref=<tag>`.

- `--ref main` reads the workflow *definition* from `main`.
- `-f ref=<tag>` checks *out* the tag.

Splitting the two is what makes the ref argument meaningful, and it is why the
bootstrap below works even for a tag that predates these files.

`publish.yml` refuses to guess. It fails if the ref and `package.json` disagree,
and it no-ops — successfully, with a notice — when that version is already on the
registry, so a re-run, or a race between two dispatches, is safe.

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

### 1. npm trusted publisher — already configured

On npmjs.com, the package's **Settings → Trusted publishing** carries a GitHub
Actions entry naming the workflow file **`publish.yml`**. It has to stay that
name.

Confirm the entry before the next release; the package must also already exist on
the registry before trust can be configured at all, and `vibi-yt` does.

| Field | Value |
| --- | --- |
| Organization or user | `fookhsu` |
| Repository | `vibi-yt` |
| Workflow filename | `publish.yml` — filename only, case-sensitive |
| Environment name | blank; no workflow here declares an environment |
| Allowed actions | **`npm publish`** must be ticked |

There is **no token**. npm exchanges the workflow's OIDC identity for a
short-lived credential and attaches the provenance attestation automatically,
which is why `publish.yml` carries `id-token: write` and why the job upgrades
npm: trusted publishing needs npm `>= 11.5.1`, and the npm bundled with Node 24
can be older.

If you add an environment to `publish.yml` later, the same name has to be typed
into this table — the two are matched exactly, and a mismatch is a `403`.

### 2. Let Actions open the Release PR

While `release.yml` runs on the default `GITHUB_TOKEN`, this repository setting
must be on:

> **Settings → Actions → General → Workflow permissions →
> Allow GitHub Actions to create and approve pull requests**

**Optional upgrade.** Create a fine-grained PAT with `contents: write` and
`pull requests: write`, store it as the secret `RELEASE_PLEASE_TOKEN`, and the
action picks it up automatically — `release.yml` reads
`secrets.RELEASE_PLEASE_TOKEN || secrets.GITHUB_TOKEN`. Do this if you want the
Release PR to have real CI: `pull_request` runs triggered by `GITHUB_TOKEN` are
suppressed, so on the fallback path the Release PR arrives without checks. The
`publish.yml` gate still runs either way, so nothing unverified reaches npm.

### 3. Bootstrap — done for 0.2.0

This has already been carried out; it is recorded because it cannot be repeated
and explains the current tag layout.

`package.json` was at `0.2.0` while the newest tag was `v0.1.4` and npm's
`latest` was `0.1.4` — 0.2.0 had never been released. The tag had to exist
**before** these workflows first landed on `main`, because release-please scopes
the Release PR to the commits after the newest tag: without `v0.2.0` its first PR
would have re-announced the whole 0.2.0 rewrite as the next release. So the tag
was pushed together with the branch:

```bash
git tag v0.2.0 1eddc51        # lightweight, like v0.1.4
git push origin main v0.2.0
```

`release.yml` then confirmed the layout on its first run — `found: v0.2.0`,
`version: 0.2.0`, and *no user facing commits since* — and skipped instead of
opening a bogus Release PR.

0.2.0 still needs its GitHub Release and its npm publish, both driven from
`publish.yml` with the tag as the ref:

```bash
awk '/^## 0\.2\.0$/{f=1;next} /^## /{f=0} f' CHANGELOG.md > /tmp/vibi-yt-0.2.0.md
gh release create v0.2.0 --title v0.2.0 -F /tmp/vibi-yt-0.2.0.md
gh workflow run publish.yml -f ref=v0.2.0
```

## Publishing by hand

```bash
gh workflow run publish.yml -f ref=v0.2.0    # or any tag, or a branch
```

That is the same job every release uses — check out the ref, run the gate, skip
if already published — so it is also the retry path for a dispatch that was lost
or a run that failed after the tag existed.

## What stays manual

- **Merging the Release PR.** Nothing here merges it for you. The version on
  `main` is always a reviewed decision.
- **The bump itself.** It comes from commit messages, so a mislabeled commit
  produces a mislabeled release. Correct it by editing the Release PR before
  merging — that is exactly the window the PR exists to provide.
- **Unpublishing and deprecating.**
