/** @file Shared CLI constants: the flag table and the release check list. */

/**
 * A table of CLI flags. Each key is the name the parsed arguments use, each
 * value is the `[long, short]` spelling of the flag on the command line.
 * @typedef {Record<string, [string, string]>} FlagTable
 */

/**
 * Flags accepted by every releasemaker command.
 * @type {FlagTable}
 */
export const FLAGS = {
    release: ['--release-version', '-r'], // Release the package
    development: ['--development-version', '-d'], // Override development version
    tag: ['--tag', '-t'], // Override git tag
    packages: ['--package', '-p'], // Select workspace package
    patch: ['--patch', '-P'], // Override patch version
    minor: ['--minor', '-m'], // Override minor version
    major: ['--major', '-M'], // Override major version
    dryRun: ['--dry-run', '-n'], // Dry run mode
    skipChecks: ['--skip-checks', '-s'], // Skip checks
    skipPack: ['--skip-pack', '-k'], // Skip pnpm pack validation
};

/**
 * Keys of {@link FLAGS} that take no value. Every other flag expects one.
 * @type {ReadonlyArray<string>}
 */
export const BOOLEAN_FLAGS = ['dryRun', 'skipChecks', 'skipPack'];

/**
 * package.json scripts that `prepare` runs as release checks, in this order,
 * when the target package defines them. Scripts not on this list are never
 * run automatically, so things like `dev` or `publish` cannot be triggered.
 * @type {ReadonlyArray<string>}
 */
export const CHECK_SCRIPTS = ['lint', 'typecheck', 'type-check', 'test', 'build'];
