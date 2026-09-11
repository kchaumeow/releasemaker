import { accessSync, constants } from 'node:fs';
import path from 'node:path';
import { EXIT_CODES, failure } from '../errors.js';
import * as git from '../git.js';
import { runInherited } from '../shell.js';

const checkError = failure('check', EXIT_CODES.checkFailure);

const isExecutable = (filePath) => {
    try {
        accessSync(filePath, constants.X_OK);
        return true;
    } catch {
        return false;
    }
};

const executableName = (command) => command.trim().split(/\s+/)[0];

const SHELL_EXPRESSION = /[|&;<>()`$]/;

const isShellExpression = (command) => SHELL_EXPRESSION.test(command) || executableName(command).includes('=');

/*
 * Dry runs must not execute user checks (they may mutate files), so the
 * executable is only looked up the way the shell would find it.
 */
export const unresolvableCheck = (command, directory) => {
    const name = executableName(command);
    if (name.includes('/') || name.includes('\\')) {
        if (isExecutable(path.resolve(directory, name))) {
            return undefined;
        }
        return name;
    }
    const directories = (process.env.PATH ?? '').split(path.delimiter).filter((entry) => entry !== '');
    const extensions = [''];
    if (process.platform === 'win32') {
        extensions.push('.cmd', '.exe', '.bat');
    }
    for (const entry of directories) {
        for (const extension of extensions) {
            if (isExecutable(path.join(entry, name + extension))) {
                return undefined;
            }
        }
    }
    return name;
};

export const verifyChecksResolvable = (config, directory) => {
    for (const command of config.checks) {
        if (isShellExpression(command)) {
            console.log(`[check] ${command} ... not verified (shell expression, not executed in dry run)`);
            continue;
        }
        const missing = unresolvableCheck(command, directory);
        if (missing !== undefined) {
            throw checkError(`command "${missing}" of check "${command}" was not found`);
        }
        console.log(`[check] ${command} ... resolvable (not executed in dry run)`);
    }
};

export const runChecks = (args, config, directory) => {
    if (args.skipChecks) {
        console.error('[prepare] WARNING: --skip-checks given; the configured checks were NOT run:');
        for (const command of config.checks) {
            console.error(`  ${command}`);
        }
        return;
    }
    for (const command of config.checks) {
        runInherited('check', command, directory, EXIT_CODES.checkFailure);
    }
    const changed = git.changedPaths(directory);
    if (changed.length > 0) {
        throw checkError(`the checks modified tracked files or left untracked files behind:\n  ${changed.join('\n  ')}`);
    }
};
