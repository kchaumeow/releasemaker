/** @file Command-line argument parsing built on `util.parseArgs` and the shared flag table. */

import { parseArgs } from 'node:util';
import { FLAGS, BOOLEAN_FLAGS } from './constants.js';

/** @typedef {import('./constants.js').FlagTable} FlagTable */

/**
 * Parsed CLI arguments, keyed by the {@link FLAGS} keys.
 * @typedef {Object} CliArgs
 * @property {string} [release]     Value of `--release-version` / `-r`.
 * @property {string} [development] Value of `--development-version` / `-d`.
 * @property {string} [tag]         Value of `--tag` / `-t`.
 * @property {string} [packages]    Value of `--package` / `-p`: the workspace package to act on.
 * @property {string} [patch]       Value of `--patch` / `-P`.
 * @property {string} [minor]       Value of `--minor` / `-m`.
 * @property {string} [major]       Value of `--major` / `-M`.
 * @property {boolean} dryRun       `--dry-run` / `-n`: print commands instead of running them.
 * @property {boolean} skipChecks   `--skip-checks` / `-s`: do not run check scripts.
 * @property {boolean} skipPack     `--skip-pack` / `-k`: do not validate `pnpm pack`.
 * @property {string[]} positionals Arguments that are not flags, in order.
 */

/**
 * One option definition as expected by `util.parseArgs`.
 * @typedef {Object} ParseArgsOption
 * @property {'boolean' | 'string'} type Whether the flag takes a value.
 * @property {string} short              Single-character short alias, without the dash.
 */

const booleanFlags = new Set(BOOLEAN_FLAGS);

/**
 * Strip the leading dashes from a long flag.
 * @param {string} flag A long flag such as `--dry-run`.
 * @returns {string} The bare option name such as `dry-run`.
 */
function longName(flag) {
    return flag.replace(/^--/, '');
}

/**
 * Turn a flag table into the `options` object expected by `util.parseArgs`.
 * Flags listed in {@link BOOLEAN_FLAGS} become boolean options, all others
 * take a string value.
 * @param {FlagTable} [flags=FLAGS] Flag table to convert.
 * @returns {Record<string, ParseArgsOption>} Options keyed by bare long name.
 */
export function buildOptions(flags = FLAGS) {
    const options = {};
    for (const [key, [long, short]] of Object.entries(flags)) {
        options[longName(long)] = {
            type: booleanFlags.has(key) ? 'boolean' : 'string',
            short: short.replace(/^-/, ''),
        };
    }
    return options;
}

/**
 * Parse CLI arguments into an object keyed by the flag table keys.
 * Boolean flags default to `false`, value flags to `undefined`.
 * @param {string[]} argv           Arguments to parse: everything after the command name.
 * @param {FlagTable} [flags=FLAGS] Flag table that defines the accepted flags.
 * @returns {CliArgs} The parsed arguments.
 * @throws {TypeError} When an unknown flag is passed or a value flag is missing its value.
 */
export function parseCliArgs(argv, flags = FLAGS) {
    const { values, positionals } = parseArgs({
        args: argv,
        options: buildOptions(flags),
        strict: true,
        allowPositionals: true,
    });

    const result = {};
    for (const [key, [long]] of Object.entries(flags)) {
        const value = values[longName(long)];
        result[key] = booleanFlags.has(key) ? Boolean(value) : value;
    }
    result.positionals = positionals;
    return result;
}
