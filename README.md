# releasemaker

Maven Release Plugin-like `prepare` / `perform` workflow for pnpm projects. Uses SemVer prerelease versions such as `1.4.0-alpha` instead of `-SNAPSHOT`. See `spec.md` for the full specification.

## Install

```bash
pnpm add -D releasemaker
pnpm exec releasemaker prepare --dry-run
```

## Workflow

```bash
pnpm exec releasemaker prepare      # release commit, annotated tag, development commit
git push --follow-tags
pnpm exec releasemaker perform      # publish the tarball built from the tag
```

`prepare` never pushes or publishes. `perform` never changes versions or creates commits.

## `prepare`

1. Verifies the repository: clean working tree, HEAD on a release branch, no merge or rebase in progress, `pnpm-lock.yaml` present (unless `.npmrc` sets `lockfile=false`), branch not behind or diverged from its upstream.
2. Selects the package (root, `package` from configuration or `--package`) and rejects private packages.
3. Resolves release, development version and tag. Interactive when stdin is a TTY and `--non-interactive` is absent: Enter accepts each default, invalid SemVer is asked again, a final confirmation is shown.
4. Verifies that the tag exists neither locally nor on the remote and that the version is not on the registry.
5. Runs the configured checks and fails if they modified tracked files or left untracked files behind.
6. Writes the release version, runs `pnpm install --lockfile-only`, `pnpm pack --dry-run`, commits `release: X`, creates the annotated tag, writes the development version and commits `chore: prepare development Y`.
7. Writes `.releasemaker/release-state.json` (warns when the directory is not ignored by Git).

When a remote or the registry cannot be reached, interactive mode asks whether to continue; non-interactive mode and dry runs fail with exit code 3.

If a step fails after files were changed, the touched files are restored. If it fails after the release commit or tag, HEAD is reset to the starting commit and the tag is deleted, provided HEAD still points at a commit created by this run. Otherwise the repository state and manual recovery commands are printed. Remote refs are never touched.

| Option | Short | Meaning |
|---|---|---|
| `--release-version <version>` | `-r` | Explicit release version |
| `--development-version <version>` | `-d` | Explicit post-release development version |
| `--tag <tag>` | `-t` | Explicit Git release tag |
| `--package <name-or-path>` | `-p` | Workspace package by exact name or relative path |
| `--patch` / `--minor` / `--major` | | Bump the stable core of the current version |
| `--non-interactive` | `-y` | Accept derived values, never prompt |
| `--dry-run` | | Print the plan, verify preconditions and check resolvability, change nothing |
| `--skip-checks` | | Skip configured checks, prints a warning |
| `--skip-pack` | | Skip `pnpm pack --dry-run` |
| `--help` | `-h` | Show help |

`--release-version`, `--patch`, `--minor` and `--major` are mutually exclusive.

## `perform`

Resolves the release tag from `--tag`, then from a single release tag on HEAD, then from `.releasemaker/release-state.json`. The tagged source is checked out into a temporary Git worktree where `pnpm install --frozen-lockfile`, `pnpm build` and `pnpm pack` run. The package version at the tag must be stable SemVer, match the version encoded by `tagFormat`, and must not exist on the registry. The tarball is published with `pnpm publish <tarball>`; authentication comes from the usual `.npmrc` and environment mechanisms. The worktree is removed afterwards and the release state file is deleted when it refers to the published tag.

If `pnpm publish` fails, the registry is queried again: when the version now exists the command exits with code 8 and asks to verify the registry; nothing is ever republished automatically.

| Option | Short | Meaning |
|---|---|---|
| `--tag <tag>` | `-t` | Explicit prepared release tag |
| `--package <name-or-path>` | `-p` | Select the package inside the tagged checkout |
| `--registry <url>` | | Override the configured or default registry |
| `--dry-run` | | Check out, install, build and pack, but do not publish |
| `--skip-build` | | Skip `pnpm build` (packing still runs) |
| `--help` | `-h` | Show help |

## Configuration

`releasemaker.json` or `.releasemakerrc` in the project root, JSON. Having both is an error. Unknown keys are rejected. CLI options win over the file, the file wins over the defaults. Never put credentials in it.

| Key | Default | Meaning |
|---|---|---|
| `developmentSuffix` | `"alpha"` | Prerelease suffix of the next development version |
| `tagFormat` | `"v${version}"` | Tag template, `${version}` exactly once |
| `releaseBranch` | `"main"` | Branch or array of branches `prepare` may run on |
| `registry` | `null` | Registry for the collision check and `perform` |
| `checks` | `["pnpm install --frozen-lockfile", "pnpm test", "pnpm build"]` | Commands run by `prepare` before any mutation |
| `pack` | `true` | Validate with `pnpm pack --dry-run` during `prepare` |
| `package` | `null` | Default workspace package selector |

## Exit codes

| Code | Meaning |
|---|---|
| 0 | success |
| 1 | unexpected failure |
| 2 | invalid CLI usage or configuration |
| 3 | precondition failure (Git state, versions, tags, registry collision, package selection) |
| 4 | check, lockfile, pack, install or build failure |
| 5 | Git command failure |
| 6 | registry or publish failure |
| 7 | user cancellation |
| 8 | ambiguous publication state |

## Development

```bash
pnpm install
pnpm test
```

Tests run against real temporary Git repositories with a bare `origin`. pnpm is replaced by a fake script on `PATH` (`test/helpers/fake-pnpm.js`) that answers `view`, `publish`, `pack` and `install` from control files and logs every call; only `pnpm ls` is delegated to the real pnpm.
