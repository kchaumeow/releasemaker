#!/usr/bin/env node
import { EXIT_CODES, ReleasemakerError } from '../errors.js';
import { USAGE } from './constants.js';

const HELP_FLAGS = ['--help', '-h'];

const command = process.argv[2];
const commandArguments = process.argv.slice(3);

const run = async () => {
    if (command === undefined) {
        console.error(USAGE);
        process.exitCode = EXIT_CODES.invalidUsage;
        return;
    }
    if (HELP_FLAGS.includes(command)) {
        console.log(USAGE);
        return;
    }
    if (command === 'prepare') {
        const { prepare } = await import('./prepare.js');
        await prepare(commandArguments, process.cwd());
        return;
    }
    if (command === 'perform') {
        if (commandArguments.some((argument) => HELP_FLAGS.includes(argument))) {
            console.log(USAGE);
            return;
        }
        throw new ReleasemakerError('[perform] No prepared release could be resolved.', EXIT_CODES.preconditionFailure);
    }
    throw new ReleasemakerError(`[usage] unknown command "${command}"; use "prepare" or "perform"`, EXIT_CODES.invalidUsage);
};

try {
    await run();
} catch (error) {
    if (error instanceof ReleasemakerError) {
        console.error(error.message);
        process.exitCode = error.exitCode;
    } else {
        console.error(`[releasemaker] unexpected error: ${error.stack}`);
        process.exitCode = EXIT_CODES.generalFailure;
    }
}
