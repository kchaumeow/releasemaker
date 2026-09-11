# Releasemaker Specification

**Status:** Draft v1  
**Target ecosystem:** pnpm / Node.js projects  
**Primary goal:** provide a Maven Release Plugin-like `prepare` / `perform` workflow for frontend and Node.js repositories, using SemVer prerelease versions such as `1.4.0-alpha` instead of Maven `-SNAPSHOT` versions.

---

## 1. Goals

`releasemaker` standardizes releases across company pnpm projects.

The release model uses three explicit versions:

- **current version** - the version currently stored in `package.json`, for example `1.4.0-alpha`.
- **release version** - the immutable version being released, for example `1.4.0`.
- **development version** - the version written after the release is prepared, for example `1.4.1-alpha`.

The workflow has two stages:

```text
prepare
  -> validate
  -> choose versions
  -> test/build/package
  -> commit release version
  -> create release tag
  -> commit next development version

perform
  -> resolve prepared release tag
  -> obtain the exact tagged source
  -> install/build/package
  -> publish the package produced from that source
```

`prepare` never publishes and never pushes Git commits or tags. `perform` never invents a new release version.

---

## 2. Installation and invocation

The package exposes a binary named `releasemaker`.

Recommended project dependency:

```bash
pnpm add -D releasemaker
```

Canonical invocation:

```bash
pnpm exec releasemaker <command> [options]
```

If pnpm resolves package binaries directly in the project's command context, this may also be used:

```bash
pnpm releasemaker <command> [options]
```

Examples:

```bash
pnpm exec releasemaker prepare
pnpm exec releasemaker prepare --patch
pnpm exec releasemaker prepare -r 2.3.0 -d 2.3.1-alpha
pnpm exec releasemaker perform
```

---

## 3. Configuration

### 3.1 Configuration files

`releasemaker` searches the repository root for these files, in order:

1. `releasemaker.json`
2. `.releasemakerrc`

Both contain JSON.

If both files exist, `releasemaker` fails with a configuration error instead of silently choosing one.

Configuration is optional. Missing values use built-in defaults.

### 3.2 Configuration shape

Example:

```json
{
  "developmentSuffix": "alpha",
  "tagFormat": "v${version}",
  "releaseBranch": "main",
  "registry": "https://registry.example.com/",
  "checks": [
    "pnpm install --frozen-lockfile",
    "pnpm audit",
    "pnpm test",
    "pnpm build"
  ],
  "pack": true,
  "package": null
}
```

### 3.3 Configuration fields

| Field | Type | Default | Meaning |
|---|---|---|---|
| `developmentSuffix` | string | `"alpha"` | Prerelease suffix used when deriving the next development version. |
| `tagFormat` | string | `"v${version}"` | Git tag template. `${version}` is replaced with the release version. |
| `releaseBranch` | string or string[] | `"main"` | Branch or branches from which `prepare` may run. |
| `registry` | string or null | pnpm/npm configuration | Registry used by `perform`. Does not contain credentials. |
| `checks` | string[] | see below | Commands executed during `prepare` before Git release mutations. |
| `pack` | boolean | `true` | Whether `prepare` validates the package using `pnpm pack`. |
| `package` | string or null | `null` | Default workspace package selector. `null` means the root package. |

Default checks:

```json
[
  "pnpm install --frozen-lockfile",
  "pnpm test",
  "pnpm build"
]
```

Projects may add `pnpm audit`, linting, type checking, or other company-specific checks.

### 3.4 Precedence

For every configurable value, precedence is:

```text
CLI option > configuration file > built-in default
```

Interactive answers override derived defaults but do not rewrite the configuration file.

### 3.5 Credentials

Registry credentials, npm tokens, passwords, and other secrets must not be stored in `releasemaker.json` or `.releasemakerrc`.

Authentication is delegated to normal pnpm/npm mechanisms such as `.npmrc` and environment variables.

---

## 4. Version model

All versions must be valid SemVer 2.0.0 versions.

Typical lifecycle:

```text
1.4.0-alpha   current development version
1.4.0         release version
1.4.1-alpha   next development version
```

`-alpha` is a SemVer prerelease suffix. The suffix is configurable through `developmentSuffix`.

### 4.1 Default release version

If the current version has a prerelease component, the default release version is the same major/minor/patch version without the prerelease component.

```text
1.4.0-alpha     -> 1.4.0
1.4.0-alpha.7   -> 1.4.0
2.0.0-beta      -> 2.0.0
```

If the current version is already stable, the default release version is the next patch version:

```text
1.4.0 -> 1.4.1
2.0.0 -> 2.0.1
```

### 4.2 Default development version

Unless explicitly overridden, the development version is the next patch after the resolved release version plus the configured development suffix:

```text
release 1.4.0 -> development 1.4.1-alpha
release 1.5.0 -> development 1.5.1-alpha
release 2.0.0 -> development 2.0.1-alpha
```

This rule is intentionally independent of whether the release was chosen through `--patch`, `--minor`, `--major`, an explicit version, or an interactive answer.

### 4.3 Version ordering requirements

The following must hold:

```text
releaseVersion > currentVersion

developmentVersion > releaseVersion
```

Comparison uses SemVer precedence.

Exception: when the current version is a prerelease of exactly the release version, removing the prerelease is valid:

```text
1.4.0-alpha -> 1.4.0
```

An explicitly supplied development version may use any prerelease suffix, but it must still be greater than the release version.

---

## 5. Command: `prepare`

### 5.1 Syntax

```bash
releasemaker prepare [options]
```

### 5.2 Options

| Option | Short | Argument | Meaning |
|---|---|---|---|
| `--release-version` | `-r` | `<version>` | Explicit release version. |
| `--development-version` | `-d` | `<version>` | Explicit post-release development version. |
| `--tag` | `-t` | `<tag>` | Explicit Git release tag. |
| `--package` | `-p` | `<name-or-path>` | Select a package in a pnpm workspace. |
| `--patch` | | none | Select a patch release. |
| `--minor` | | none | Select a minor release. |
| `--major` | | none | Select a major release. |
| `--non-interactive` | `-y` | none | Accept derived/default values and never prompt. |
| `--dry-run` | | none | Resolve and validate the release plan without modifying files, Git refs, or the registry. |
| `--skip-checks` | | none | Skip configured check commands. Intended for exceptional use; warnings are printed. |
| `--skip-pack` | | none | Skip `pnpm pack` validation during prepare. |
| `--help` | `-h` | none | Show command help. |

`--next-version` is intentionally not used because it is ambiguous between release and development versions.

### 5.3 Mutually exclusive version selectors

These options are mutually exclusive:

```text
--release-version / -r
--patch
--minor
--major
```

Examples that fail:

```bash
releasemaker prepare --minor --release-version 2.0.0
releasemaker prepare --patch --major
```

`--development-version` may be combined with any one release selector.

### 5.4 Patch/minor/major resolution

The bump flags operate on the stable core of the current version.

Given `1.4.0-alpha`:

```text
--patch -> 1.4.0
--minor -> 1.5.0
--major -> 2.0.0
```

Given stable `1.4.0`:

```text
--patch -> 1.4.1
--minor -> 1.5.0
--major -> 2.0.0
```

Given `1.4.3-alpha`:

```text
--patch -> 1.4.3
--minor -> 1.5.0
--major -> 2.0.0
```

The purpose of `--patch` on a prerelease is therefore "release the current patch line", not "increment the patch once more".

### 5.5 Interactive mode

Interactive mode is the default when stdin is a TTY and `--non-interactive` is not present.

Example:

```text
Current version: 1.4.0-alpha

Release version [1.4.0]:
> 1.4.0

Development version [1.4.1-alpha]:
> 1.4.1-alpha

Release tag [v1.4.0]:
> v1.4.0

Run checks:
  pnpm install --frozen-lockfile
  pnpm test
  pnpm build

Proceed with release preparation? (Y/n)
```

Pressing Enter accepts the displayed default.

If `--patch`, `--minor`, `--major`, `--release-version`, `--development-version`, or `--tag` is provided, the supplied value becomes the default and the corresponding question may be omitted. A final confirmation is still shown unless `--non-interactive` is used.

Interactive input is validated immediately. Invalid SemVer values are rejected and the user is prompted again.

### 5.6 Non-interactive mode

```bash
releasemaker prepare --non-interactive
```

No questions are asked. All missing values are derived automatically.

If a required value cannot be resolved unambiguously, the command fails instead of guessing.

Non-interactive mode is implied when stdin is not a TTY, for example in CI. In that situation a warning is not necessary.

### 5.7 Prepare preconditions

Before running project checks or modifying files, `prepare` verifies:

1. a Git repository exists;
2. the selected package exists and has a valid `package.json`;
3. the current version is valid SemVer;
4. the working tree has no tracked or untracked changes, except files explicitly ignored by Git;
5. HEAD is on an allowed release branch;
6. HEAD is not detached;
7. the local release branch has no unresolved merge/rebase/cherry-pick operation;
8. the configured pnpm lockfile exists when the project normally uses one;
9. the resolved release and development versions satisfy the version rules;
10. the release tag does not already exist locally;
11. the release tag does not already exist on the configured Git remote when the remote is reachable;
12. the release version is not already published to the target registry when registry metadata is reachable.

A failure in any mandatory precondition stops the command before release mutations begin.

Remote Git or registry unavailability is handled as follows:

- in interactive mode, the command reports that the remote check could not be completed and asks whether to continue;
- in non-interactive mode, the command fails closed;
- `--dry-run` reports the unresolved remote check and exits non-zero in non-interactive mode.

### 5.8 Prepare execution

After validation and confirmation, `prepare` performs these steps:

1. Record the starting Git commit.
2. Run configured checks unless `--skip-checks` is present.
3. Write the release version to the selected `package.json`.
4. Update the pnpm lockfile consistently with the version change.
5. Run `pnpm pack --dry-run` or equivalent package-content validation when `pack` is enabled and `--skip-pack` is absent.
6. Run the configured build again only if the version change can affect build output and the project configuration requests it. The default v1 behavior is not to duplicate the full check suite.
7. Commit the release version changes.
8. Create the release Git tag.
9. Write the development version to `package.json`.
10. Update the lockfile consistently.
11. Commit the development version changes.
12. Write local release state used by a subsequent local `perform`.

Default commit messages:

```text
release: 1.4.0
chore: prepare development 1.4.1-alpha
```

Default tag:

```text
v1.4.0
```

The exact commit message format may become configurable later, but is fixed in v1 to keep behavior predictable.

### 5.9 Local release state

After successful preparation, `releasemaker` writes:

```text
.releasemaker/release-state.json
```

Example:

```json
{
  "package": "@company/ui",
  "releaseVersion": "1.4.0",
  "developmentVersion": "1.4.1-alpha",
  "tag": "v1.4.0",
  "releaseCommit": "<git-sha>",
  "developmentCommit": "<git-sha>"
}
```

This state is local execution metadata and must not be committed. `releasemaker` should warn if `.releasemaker/` is not ignored by Git.

The state file enables this local workflow:

```bash
releasemaker prepare
git push --follow-tags
releasemaker perform
```

CI does not require this state file when it runs from the release tag.

### 5.10 `--package`

`--package` selects the package whose version is released.

Accepted values may be:

- an exact workspace package name, such as `@company/ui`;
- a relative path to a package directory, such as `packages/ui`.

If the selector matches zero packages, the command fails.

If it matches more than one package, the command fails. Wildcard selection is intentionally unsupported in v1.

Without `--package`, selection precedence is:

1. `package` from configuration;
2. root `package.json`.

If the repository is a workspace and the root package is `private: true`, with no configured package and no `--package`, `prepare` fails and asks the user to select a package in interactive mode.

Independent multi-package release orchestration is out of scope for v1.

### 5.11 `--dry-run`

`--dry-run` performs all read-only resolution and validation possible without changing project state.

It prints a release plan, for example:

```text
Package:              @company/ui
Current version:      1.4.0-alpha
Release version:      1.4.0
Development version:  1.4.1-alpha
Tag:                  v1.4.0
Release branch:       main
Registry:             https://registry.example.com/

Checks:
  pnpm install --frozen-lockfile
  pnpm test
  pnpm build

Would create commits:
  release: 1.4.0
  chore: prepare development 1.4.1-alpha

Would create tag:
  v1.4.0
```

Dry run guarantees:

- no `package.json` or lockfile changes;
- no commits;
- no tags;
- no release-state file;
- no registry writes;
- no `git push`.

Configured check commands are **not executed by default** during dry run because arbitrary checks may mutate files. Releasemaker validates that the commands are resolvable and prints them. A future explicit `--run-checks` option may be added if needed.

### 5.12 `--skip-checks`

`--skip-checks` skips all configured check commands.

It does **not** skip:

- Git state validation;
- SemVer validation;
- tag collision checks;
- registry version collision checks;
- lockfile update;
- package metadata validation.

The command prints a prominent warning. In CI, projects may forbid this flag through wrapper policy, but releasemaker itself allows it.

### 5.13 Failure and rollback behavior

`prepare` is transactional with respect to changes made by `releasemaker` as far as practical.

Before the first mutation it records:

- starting HEAD;
- relevant file contents;
- whether the release tag existed.

If a failure occurs before the release commit, changed release files are restored.

If a failure occurs after the release commit or tag but before the final development commit, `releasemaker` attempts to restore HEAD to the starting commit and delete only the tag it created, provided those refs have not been pushed and HEAD has not been externally changed.

It must never automatically delete or rewrite remote refs.

Generated untracked files from user-defined check/build commands are not automatically deleted unless they are known releasemaker temporary files.

If automatic rollback cannot be proven safe, the command stops and prints the exact repository state and manual recovery commands rather than performing a destructive reset.

---

## 6. Command: `perform`

### 6.1 Syntax

```bash
releasemaker perform [options]
```

### 6.2 Options

| Option | Short | Argument | Meaning |
|---|---|---|---|
| `--tag` | `-t` | `<tag>` | Explicit prepared release tag to publish. |
| `--package` | `-p` | `<name-or-path>` | Select the package when required. |
| `--registry` | | `<url>` | Override the configured/default registry. |
| `--dry-run` | | none | Resolve, install, build, and package as safely possible but do not publish. |
| `--skip-build` | | none | Skip the build step during perform. Packaging still occurs. |
| `--help` | `-h` | none | Show command help. |

`perform` intentionally has no `--release-version`, `--patch`, `--minor`, or `--major` options. A release version must already have been fixed by `prepare` and its Git tag.

### 6.3 Release source resolution

`perform` resolves the release source in this order:

1. `--tag`, if supplied;
2. the current HEAD tag, if HEAD is tagged with exactly one tag matching `tagFormat`;
3. `.releasemaker/release-state.json`, if present and valid.

If none resolves exactly one release tag, `perform` fails.

If HEAD has multiple matching release tags, `perform` fails unless `--tag` is supplied.

This makes CI tag pipelines straightforward:

```text
checkout v1.4.0
pnpm install --frozen-lockfile
pnpm exec releasemaker perform
```

and also supports local execution after `prepare` through the local release-state file.

### 6.4 Source integrity validation

Before publishing, `perform` verifies:

1. the Git tag exists;
2. the tag resolves to a commit;
3. the selected package at the tagged commit has a stable SemVer version;
4. that version matches the version encoded by `tagFormat` where the format is reversible;
5. the package version is not a prerelease development version such as `-alpha` unless explicitly encoded in the prepared tag;
6. the target registry does not already contain that package version;
7. the tagged source is obtainable in an isolated worktree or temporary checkout.

If the registry already contains the exact version, `perform` fails without republishing. Publishing an existing version is never treated as success because the registry artifact may not be identical.

### 6.5 Perform execution

`perform` must build from the tagged source rather than the caller's current working tree.

Default sequence:

1. Resolve the prepared release tag.
2. Create an isolated temporary Git worktree/check-out at that tag.
3. Resolve/select the package inside that checkout.
4. Run `pnpm install --frozen-lockfile`.
5. Run `pnpm build` unless `--skip-build` is present.
6. Run `pnpm pack` and capture the generated `.tgz` artifact.
7. Validate the packed artifact's name and version.
8. Publish the `.tgz` to the selected registry using pnpm/npm authentication.
9. Remove the temporary worktree and temporary package artifact.
10. Mark the local release state as performed or remove it if it refers to the published release.

Conceptually:

```text
Git tag v1.4.0
      |
      v
isolated checkout
      |
      v
pnpm install --frozen-lockfile
      |
      v
pnpm build
      |
      v
pnpm pack
      |
      v
package-1.4.0.tgz
      |
      v
private registry
```

Publishing the `.tgz` rather than running `pnpm publish` directly from the developer checkout ensures that the registry receives the package produced from the immutable release tag.

### 6.6 Registry resolution

Registry precedence:

```text
--registry > configuration `registry` > normal pnpm/npm registry configuration
```

`perform` does not modify persistent npm/pnpm registry configuration.

If authentication fails, the command exits non-zero and leaves the Git repository unchanged.

### 6.7 `perform --dry-run`

`perform --dry-run` verifies as much of the publishing pipeline as possible without writing to the registry.

It may:

- create the isolated checkout;
- install dependencies;
- build;
- create the `.tgz`;
- inspect package metadata;
- verify whether the version already exists in the registry.

It must not:

- publish;
- mutate Git refs;
- modify the caller's checkout;
- mark the release state as performed.

If pnpm supports a registry-safe publish dry-run for the current version, releasemaker may invoke it only as an additional validation step; it is not a replacement for packaging the tagged source.

### 6.8 `--skip-build`

`--skip-build` skips the explicit build command during `perform`.

`pnpm pack` still runs, including any package lifecycle hooks that pnpm itself normally executes for packing. Releasemaker does not suppress native package-manager lifecycle behavior.

This flag is useful only when build output is already produced by a package lifecycle hook or no build is required.

---

## 7. Git behavior

### 7.1 No automatic push

Neither command executes `git push`.

Recommended local flow:

```bash
pnpm exec releasemaker prepare
git push --follow-tags
pnpm exec releasemaker perform
```

Recommended CI flow:

```text
Developer:
  releasemaker prepare
  git push --follow-tags

CI on release tag:
  checkout tag
  releasemaker perform
```

### 7.2 Tag format

Default:

```json
{
  "tagFormat": "v${version}"
}
```

For release `1.4.0`:

```text
v1.4.0
```

For monorepos where package names must be encoded, a project may configure for example:

```json
{
  "tagFormat": "ui-v${version}"
}
```

`tagFormat` must contain `${version}` exactly once.

An explicit `--tag` may override the configured format, but the release version must still be independently validated against the selected package at that tag during `perform`.

---

## 8. Edge cases

### 8.1 Current version is `1.4.0-alpha`

Default interactive/non-interactive proposal:

```text
current:      1.4.0-alpha
release:      1.4.0
development:  1.4.1-alpha
tag:          v1.4.0
```

### 8.2 Current version is `1.4.0-alpha.12`

Default:

```text
release:      1.4.0
development:  1.4.1-alpha
```

The prerelease sequence number is not propagated automatically.

### 8.3 Current version is already `1.4.0`

Default release becomes the next patch:

```text
release:      1.4.1
development:  1.4.2-alpha
```

The tool never "releases" the same stable version again.

### 8.4 `--minor` from `1.4.3-alpha`

```text
release:      1.5.0
development:  1.5.1-alpha
```

### 8.5 `--major` from `0.8.2-alpha`

Strict SemVer bump semantics are used:

```text
release:      1.0.0
development:  1.0.1-alpha
```

No special pre-1.0 compatibility policy is inferred.

### 8.6 Explicit release version lower than current

```bash
releasemaker prepare -r 1.3.0
```

from `1.4.0-alpha` fails.

Downgrade releases are out of scope.

### 8.7 Explicit release version contains `-alpha`

An explicit release version may technically be a SemVer prerelease, but v1 rejects versions ending in the configured development suffix by default because `prepare` is intended to create production releases.

For example:

```bash
releasemaker prepare -r 1.4.0-alpha.2
```

fails when `developmentSuffix` is `alpha`.

Supporting deliberate prerelease publication can be added later as a separate mode such as `--prerelease` rather than overloading the normal release workflow.

### 8.8 Development version is stable

An explicitly supplied stable development version such as `1.4.1` is valid SemVer but rejected in v1. The development version must contain a prerelease component.

It does not have to use the configured default suffix when explicitly supplied:

```text
1.4.1-next      valid
1.4.1-beta.1    valid
1.4.1           rejected
```

### 8.9 Tag already exists

`prepare` fails before creating commits.

It never moves, overwrites, or force-updates an existing tag.

### 8.10 Registry version already exists

`prepare` fails during preflight if it can verify the collision.

`perform` always checks again immediately before publishing and fails if the version exists.

The second check protects against races between preparation and publication.

### 8.11 Working tree is dirty

`prepare` fails.

There is no `--force` option in v1. Release tooling should not guess which local modifications belong to the release.

### 8.12 Detached HEAD

`prepare` fails because it must create development history on a release branch.

`perform` may run from detached HEAD because CI commonly checks out tags in detached mode.

### 8.13 Branch is behind remote

When the remote is reachable, `prepare` fails if the configured release branch is behind its upstream.

If it is ahead only, `prepare` may continue because the user may intentionally be preparing commits before pushing.

If histories have diverged, it fails.

### 8.14 No upstream branch

Interactive mode warns and asks whether to continue.

Non-interactive mode fails closed unless future configuration explicitly permits releases without an upstream.

### 8.15 Failing tests/build/checks

`prepare` stops before creating release commits or tags.

No `--force` release is available. `--skip-checks` must be explicitly supplied to bypass configured checks.

### 8.16 Check command modifies tracked files

After configured checks complete, `prepare` verifies the working tree again.

If a check modified tracked files, generated a lockfile change, or otherwise dirtied tracked release input, `prepare` fails and reports the changed paths rather than silently committing them.

This prevents formatting/build side effects from accidentally entering the release commit.

### 8.17 Build produces ignored/untracked output

Ignored output is allowed.

Non-ignored untracked files cause the post-check cleanliness verification to fail.

### 8.18 Lockfile changes

Version changes may legitimately modify `pnpm-lock.yaml`. Releasemaker includes only lockfile changes that are produced by its own controlled version-update step.

Unexpected dependency resolution changes cause failure. The update should be performed without upgrading dependency versions.

### 8.19 Private package

If the selected package has:

```json
{
  "private": true
}
```

`prepare` fails by default because the package cannot be published.

This remains an error even if the workspace root is private but a child package is selected; only the selected package's `private` field matters.

### 8.20 Package has no version

The command fails. Fixed-version release semantics require a package version.

### 8.21 Workspace dependency versions

In v1, releasemaker does not automatically bump or rewrite independently versioned workspace dependencies.

If releasing package A requires package B's version range to change, the project must make that change before running `prepare`, or use a future multi-package release feature.

### 8.22 User cancels interactive confirmation

No files, commits, tags, or release-state files are changed. Exit code is non-zero or a dedicated cancellation code.

### 8.23 `perform` called before `prepare`

It succeeds only if an explicit or current release tag identifies a valid prepared release. Otherwise it fails with "No prepared release could be resolved."

### 8.24 `perform` from the development branch after prepare

The local state file points to the prepared release tag. `perform` still builds from the tag in an isolated checkout, never from the development commit currently checked out.

### 8.25 Release tag exists locally but was not pushed

Local `perform` may publish it.

For company CI policy, publishing can instead be restricted operationally to CI. Releasemaker itself does not require a tag to exist on a remote unless a future `requireRemoteTag` configuration is introduced.

### 8.26 Publish succeeds but cleanup fails

The command reports the release as published and separately reports cleanup failure. It must never retry publishing merely because temporary-file cleanup failed.

### 8.27 Publish response is ambiguous

If the registry connection fails after upload begins and releasemaker cannot determine whether publication succeeded, it queries the registry for the exact version.

- if the version now exists, it reports "publication likely succeeded; verify registry" and does not retry automatically;
- if the version does not exist, it reports failure and allows an explicit rerun;
- if registry state cannot be determined, it fails with an ambiguous-publication warning and never automatically republishes.

---

## 9. Exit behavior

Commands return `0` only when the requested operation completed successfully.

Suggested non-zero categories:

```text
1  general failure
2  invalid CLI usage or configuration
3  precondition failure
4  project check/build failure
5  Git operation failure
6  registry/publish failure
7  user cancellation
8  ambiguous publication state
```

Exact numeric codes are part of the CLI contract once v1.0 is released and should not change without a major version bump.

---

## 10. Output conventions

Normal output should be concise and phase-oriented:

```text
[prepare] package @company/ui
[prepare] 1.4.0-alpha -> 1.4.0 -> 1.4.1-alpha
[check] pnpm test ... ok
[check] pnpm build ... ok
[git] commit release: 1.4.0
[git] tag v1.4.0
[git] commit chore: prepare development 1.4.1-alpha
[done] release v1.4.0 prepared
```

Failures identify the failed phase and leave actionable recovery information.

Secrets and authentication tokens must never be printed.

---

## 11. Recommended workflows

### 11.1 Interactive developer release

```bash
pnpm exec releasemaker prepare
git push --follow-tags
```

CI triggered by the release tag:

```bash
pnpm exec releasemaker perform
```

### 11.2 Explicit patch release

```bash
pnpm exec releasemaker prepare --patch
git push --follow-tags
```

### 11.3 Fully non-interactive preparation

```bash
pnpm exec releasemaker prepare --minor --non-interactive
```

### 11.4 Custom versions

```bash
pnpm exec releasemaker prepare \
  --release-version 2.0.0 \
  --development-version 2.0.1-alpha
```

### 11.5 Preview

```bash
pnpm exec releasemaker prepare --minor --dry-run
pnpm exec releasemaker perform --tag v1.5.0 --dry-run
```

---

## 12. Non-goals for v1

The following are intentionally outside the initial scope:

- automatic multi-package independent version calculation;
- Changesets-style dependency graph releases;
- automatic changelog generation;
- Conventional Commits-based version calculation;
- automatic Git push;
- force-moving existing tags;
- automatic rollback of remote Git history;
- publishing development `-alpha` versions through the normal release command;
- GitHub/GitLab release-page creation;
- registry credential management.

Keeping these concerns out of v1 makes `releasemaker` a small, predictable release tool rather than a general release-management platform.

---

## 13. Core invariants

The implementation should preserve these invariants:

1. **A release version is chosen exactly once during `prepare`.**
2. **The Git tag identifies the exact source corresponding to that release version.**
3. **`perform` publishes only an artifact built from the prepared Git tag.**
4. **The caller's working tree is never used as the publication source.**
5. **Existing Git tags and existing registry versions are never overwritten.**
6. **`prepare` never pushes or publishes.**
7. **`perform` never changes versions or creates release history.**
8. **Dry-run operations never make persistent release mutations.**
9. **Configuration never contains registry credentials.**
10. **Ambiguous states fail rather than being guessed through.**
