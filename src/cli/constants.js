export const PREPARE_OPTIONS = {
    'release-version': { type: 'string', short: 'r' },
    'development-version': { type: 'string', short: 'd' },
    tag: { type: 'string', short: 't' },
    package: { type: 'string', short: 'p' },
    patch: { type: 'boolean' },
    minor: { type: 'boolean' },
    major: { type: 'boolean' },
    'non-interactive': { type: 'boolean', short: 'y' },
    'dry-run': { type: 'boolean' },
    'skip-checks': { type: 'boolean' },
    'skip-pack': { type: 'boolean' },
    help: { type: 'boolean', short: 'h' },
};

export const PERFORM_OPTIONS = {
    tag: { type: 'string', short: 't' },
    package: { type: 'string', short: 'p' },
    registry: { type: 'string' },
    'dry-run': { type: 'boolean' },
    'skip-build': { type: 'boolean' },
    help: { type: 'boolean', short: 'h' },
};

export const RELEASE_SELECTORS = ['release-version', 'patch', 'minor', 'major'];

export const PREPARE_USAGE = `Usage: releasemaker prepare [options]

Validate the project, choose the release and development versions, run the
configured checks, then commit the release version, tag it and commit the next
development version. Nothing is pushed or published.

Options:
  -r, --release-version <version>      Explicit release version
  -d, --development-version <version>  Explicit post-release development version
  -t, --tag <tag>                      Explicit Git release tag
  -p, --package <name-or-path>         Select a package in a pnpm workspace
      --patch                          Select a patch release
      --minor                          Select a minor release
      --major                          Select a major release
  -y, --non-interactive                Accept derived values and never prompt
      --dry-run                        Resolve and validate without modifying anything
      --skip-checks                    Skip configured check commands (prints a warning)
      --skip-pack                      Skip pnpm pack validation
  -h, --help                           Show this help

--release-version, --patch, --minor and --major are mutually exclusive.`;

export const PERFORM_USAGE = `Usage: releasemaker perform [options]

Publish a release prepared by "prepare": the tagged source is checked out into
an isolated worktree, installed, built, packed and the tarball is published.

Options:
  -t, --tag <tag>                      Explicit prepared release tag to publish
  -p, --package <name-or-path>         Select the package when required
      --registry <url>                 Override the configured/default registry
      --dry-run                        Resolve, install, build and pack, but do not publish
      --skip-build                     Skip the build step (packing still runs)
  -h, --help                           Show this help`;

export const USAGE = `Usage: releasemaker <command> [options]

Commands:
  prepare   Validate the project, create the release commits and tag
  perform   Publish a prepared release from its Git tag

Run "releasemaker <command> --help" for the options of a command.`;
