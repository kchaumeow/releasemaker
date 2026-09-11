import { spawnSync } from 'node:child_process';
import { ReleasemakerError } from './errors.js';

/*
 * Commands are user-authored or pnpm shell strings, so they run through the shell.
 * On Windows this also resolves pnpm.cmd without a platform switch.
 */
export const runInherited = (phase, command, directory, exitCode) => {
    console.log(`[${phase}] ${command} ...`);
    const { error, status, signal } = spawnSync(command, { cwd: directory, shell: true, stdio: 'inherit' });
    if (error) {
        throw new ReleasemakerError(`[${phase}] could not start "${command}": ${error.message}`, exitCode);
    }
    if (status === null) {
        throw new ReleasemakerError(`[${phase}] "${command}" was terminated by signal ${signal}`, exitCode);
    }
    if (status !== 0) {
        throw new ReleasemakerError(`[${phase}] "${command}" failed with exit code ${status}`, exitCode);
    }
    console.log(`[${phase}] ${command} ... ok`);
};

export const runCaptured = (command, directory) => {
    const { error, status, stdout, stderr } = spawnSync(command, { cwd: directory, shell: true, encoding: 'utf8' });
    if (error) {
        return { status: null, stdout: '', stderr: error.message };
    }
    return { status, stdout, stderr };
};

/*
 * Double quotes are understood by sh and cmd.exe alike, so interpolated paths
 * with spaces survive the shell on every platform.
 */
export const quote = (value) => `"${String(value).replace(/(["\\$`])/g, '\\$1')}"`;
