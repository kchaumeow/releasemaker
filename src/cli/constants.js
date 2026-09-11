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

export const RELEASE_SELECTORS = ['release-version', 'patch', 'minor', 'major'];

export const USAGE = `Usage: releasemaker <command> [options]

Commands:
  prepare   Validate the project and resolve the release plan
  perform   Publish a prepared release (not implemented yet)

Options for prepare:
  -r, --release-version <version>      Explicit release version
  -d, --development-version <version>  Explicit post-release development version
  -t, --tag <tag>                      Explicit Git release tag
  -p, --package <name-or-path>         Select a package in a pnpm workspace (not supported yet)
      --patch                          Select a patch release
      --minor                          Select a minor release
      --major                          Select a major release
  -y, --non-interactive                Accept derived values and never prompt
      --dry-run                        Resolve and validate without modifying anything
      --skip-checks                    Skip configured check commands
      --skip-pack                      Skip pnpm pack validation
  -h, --help                           Show this help

--release-version, --patch, --minor and --major are mutually exclusive.
Interactive prompts are not implemented yet; every run behaves as --non-interactive.`;
