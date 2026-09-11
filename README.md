# releasemaker

Maven Release Plugin-like `prepare` / `perform` workflow for pnpm projects. Uses SemVer prerelease versions such as `1.4.0-alpha` instead of `-SNAPSHOT`. See `spec.md` for the full specification.

## Install

```bash
pnpm add -D releasemaker
pnpm exec releasemaker prepare --dry-run
```

## Commands

| Command | Status |
|---|---|
| `prepare` | Resolves versions and tag, validates preconditions, runs configured checks and `pnpm pack --dry-run`. Stops before Git mutations. |
| `perform` | Not implemented. Fails with "No prepared release could be resolved." |

## `prepare` options

| Option | Short | Meaning |
|---|---|---|
| `--release-version <version>` | `-r` | Explicit release version |
| `--development-version <version>` | `-d` | Explicit post-release development version |
| `--tag <tag>` | `-t` | Explicit Git release tag |
| `--package <name-or-path>` | `-p` | Workspace package selector (not supported yet, fails) |
| `--patch` / `--minor` / `--major` | | Bump the stable core of the current version |
| `--non-interactive` | `-y` | Accepted; every run is currently non-interactive |
| `--dry-run` | | Print the release plan, execute nothing |
| `--skip-checks` | | Skip configured checks, prints a warning |
| `--skip-pack` | | Skip `pnpm pack --dry-run` |
| `--help` | `-h` | Show help |

`--release-version`, `--patch`, `--minor` and `--major` are mutually exclusive.

## Configuration

`releasemaker.json` or `.releasemakerrc` in the project root, JSON. Having both is an error. Unknown keys are rejected.

| Key | Default |
|---|---|
| `developmentSuffix` | `"alpha"` |
| `tagFormat` | `"v${version}"` |
| `releaseBranch` | `"main"` |
| `registry` | `null` |
| `checks` | `["pnpm install --frozen-lockfile", "pnpm test", "pnpm build"]` |
| `pack` | `true` |
| `package` | `null` |

## Exit codes

| Code | Meaning |
|---|---|
| 0 | success |
| 1 | unexpected failure |
| 2 | invalid CLI usage or configuration |
| 3 | precondition failure (version rules, private package, missing version) |
| 4 | check or pack failure |

## Not implemented yet

Interactive prompts, Git preconditions and mutations (commits, tag, rollback, release state), lockfile update, registry collision checks, workspace package selection, and the whole `perform` pipeline.

## Development

```bash
pnpm install
pnpm test
```
