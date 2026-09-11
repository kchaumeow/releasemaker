/**
 * @file The `prepare` command: run the target package's check scripts and validate `pnpm pack`.
 *
 * The target is the package in the directory the CLI was started in, not
 * releasemaker itself. The CLI entry point reads its package.json once and
 * passes the result in as metadata; this module never reads package.json.
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseCliArgs } from './args.js';
import { CHECK_SCRIPTS } from './constants.js';

/** @typedef {import('../metadata/package-json-reader.js').PackageMetadata} PackageMetadata */

/**
 * Summary of a prepare run.
 * @typedef {Object} PrepareResult
 * @property {string} dir            Directory of the prepared package.
 * @property {string} name           Package name from package.json.
 * @property {string} version        Package version from package.json.
 * @property {string[]} scripts      Every script name the package defines, in package.json order.
 * @property {string[]} checks       Check scripts the package defines, in run order. See {@link CHECK_SCRIPTS}.
 * @property {string[]} ran          Check scripts that were executed and passed. Empty on dry run or skip.
 * @property {string} [tarball]      File name of the tarball created by `pnpm pack`, when it ran.
 * @property {boolean} dryRun        Whether commands were only printed.
 * @property {boolean} skippedChecks Whether `--skip-checks` was set.
 * @property {boolean} skippedPack   Whether `--skip-pack` was set.
 */

/** Windows resolves `pnpm.cmd` only through a shell; everywhere else the binary is spawned directly. */
const useShell = process.platform === 'win32';

/**
 * Run a pnpm command in `cwd`, streaming its output to the terminal.
 * @param {string} cwd     Directory to run in.
 * @param {...string} args Arguments after `pnpm`, e.g. `'run', 'test'`.
 * @returns {number} The command's exit code.
 * @throws {Error} When pnpm could not be started, or was killed by a signal.
 */
const pnpm = (cwd, ...args) => {
    const command = `pnpm ${args.join(' ')}`;
    const { error, status, signal } = spawnSync('pnpm', args, { cwd, stdio: 'inherit', shell: useShell });
    if (error) throw new Error(`Could not start "${command}": ${error.message}`);
    if (status === null) throw new Error(`"${command}" was terminated by signal ${signal}`);
    return status;
};

/**
 * Pick the check scripts the package defines, in {@link CHECK_SCRIPTS} order.
 * @param {Record<string, string>} scripts The package.json `scripts` map.
 * @returns {string[]} Names of the check scripts the package has.
 */
const selectCheckScripts = (scripts) => CHECK_SCRIPTS.filter((name) => Object.hasOwn(scripts, name));

/**
 * Run `pnpm pack` into a fresh temp directory and delete it afterwards.
 * Only the tarball's file name is kept; the point is to prove packing works.
 * @param {string} dir Directory of the package to pack.
 * @returns {string | undefined} File name of the tarball pnpm produced.
 * @throws {Error} When `pnpm pack` exits non-zero.
 */
const validatePack = (dir) => {
    const destination = fs.mkdtempSync(path.join(os.tmpdir(), 'releasemaker-pack-'));
    try {
        const status = pnpm(dir, 'pack', '--pack-destination', destination);
        if (status !== 0) throw new Error(`pnpm pack failed with exit code ${status}`);
        return fs.readdirSync(destination).find((file) => file.endsWith('.tgz'));
    } finally {
        fs.rmSync(destination, { recursive: true, force: true });
    }
};

/**
 * Prepare a release.
 *
 * Prints every script the package defines, runs the scripts listed in
 * {@link CHECK_SCRIPTS} that the package has, and finally validates that
 * `pnpm pack` succeeds. The pack tarball is written to a temp directory and
 * deleted afterwards. The first failing check aborts the run.
 *
 * @param {string[]} argv            CLI arguments after the `prepare` command.
 * @param {PackageMetadata} metadata Name, version and scripts of the target package.
 * @returns {PrepareResult} What was found and what ran.
 * @throws {TypeError} When `argv` contains an unknown flag.
 * @throws {Error} When a check script exits non-zero or `pnpm pack` fails.
 */
const run = (argv, metadata) => {
    const args = parseCliArgs(argv);
    // The reader loaded package.json from the working directory, so that is the target package.
    const dir = process.cwd();
    const scripts = metadata.scripts ?? {};
    const scriptNames = Object.keys(scripts);

    console.log(`Preparing ${metadata.name}@${metadata.version}`);
    console.log(`  directory: ${dir}`);
    if (scriptNames.length === 0) {
        console.log('  scripts: none defined in package.json');
    } else {
        console.log('  scripts:');
        for (const name of scriptNames) console.log(`    - ${name}: ${scripts[name]}`);
    }

    const checks = selectCheckScripts(scripts);
    const ran = [];

    if (args.skipChecks) {
        console.log('\nSkipping checks (--skip-checks).');
    } else if (checks.length === 0) {
        console.log(`\nNo check scripts found (looked for: ${CHECK_SCRIPTS.join(', ')}).`);
    } else {
        console.log(`\nRunning checks: ${checks.join(', ')}`);
        for (const check of checks) {
            console.log(`\n> pnpm run ${check}`);
            if (args.dryRun) {
                console.log('  (dry run, not executed)');
                continue;
            }
            const status = pnpm(dir, 'run', check);
            if (status !== 0) throw new Error(`Check "${check}" failed with exit code ${status}`);
            ran.push(check);
        }
    }

    let tarball;
    if (args.skipPack) {
        console.log('\nSkipping pnpm pack validation (--skip-pack).');
    } else {
        console.log('\n> pnpm pack');
        if (args.dryRun) {
            console.log('  (dry run, not executed)');
        } else {
            tarball = validatePack(dir);
            console.log(`\nPack OK${tarball ? `: ${tarball}` : ''}`);
        }
    }

    console.log('\nPrepare finished.');
    return {
        dir,
        name: metadata.name,
        version: metadata.version,
        scripts: scriptNames,
        checks,
        ran,
        tarball,
        dryRun: args.dryRun,
        skippedChecks: args.skipChecks,
        skippedPack: args.skipPack,
    };
};

/**
 * CLI entry point for `prepare`.
 * Runs {@link run} and, on failure, prints the error to stderr and sets a
 * non-zero exit code instead of throwing.
 * @param {string[]} argv            CLI arguments after the `prepare` command.
 * @param {PackageMetadata} metadata Name, version and scripts of the target package.
 * @returns {void}
 */
export const prepare = (argv, metadata) => {
    try {
        run(argv, metadata);
    } catch (err) {
        console.error(`\nprepare failed: ${err.message}`);
        process.exitCode = 1;
    }
};
