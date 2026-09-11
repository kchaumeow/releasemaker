import { parseArgs } from 'node:util';
import { EXIT_CODES, ReleasemakerError } from '../errors.js';
import { PERFORM_OPTIONS, PREPARE_OPTIONS, RELEASE_SELECTORS } from './constants.js';

const toCamelCase = (name) => name.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase());

const usageError = (message) => new ReleasemakerError(`[usage] ${message}`, EXIT_CODES.invalidUsage);

const parseRawValues = (argumentList, options) => {
    try {
        return parseArgs({ args: argumentList, options, strict: true, allowPositionals: false }).values;
    } catch (error) {
        if (typeof error.code === 'string' && error.code.startsWith('ERR_PARSE_ARGS')) {
            throw usageError(error.message);
        }
        throw error;
    }
};

const resolveBump = (values) => {
    for (const name of ['patch', 'minor', 'major']) {
        if (values[name] === true) {
            return name;
        }
    }
    return undefined;
};

export const parseCliArgs = (argumentList, options) => {
    const values = parseRawValues(argumentList, options);
    const result = {};
    for (const [name, option] of Object.entries(options)) {
        const value = values[name];
        if (option.type === 'boolean') {
            result[toCamelCase(name)] = value === true;
        } else {
            if (value === '') {
                throw usageError(`--${name} requires a non-empty value`);
            }
            result[toCamelCase(name)] = value;
        }
    }
    return result;
};

export const parsePrepareArgs = (argumentList) => {
    const result = parseCliArgs(argumentList, PREPARE_OPTIONS);
    const selectors = RELEASE_SELECTORS.filter((name) => result[toCamelCase(name)] !== undefined && result[toCamelCase(name)] !== false);
    if (selectors.length > 1) {
        const given = selectors.map((name) => `--${name}`).join(', ');
        throw usageError(`--release-version, --patch, --minor, --major are mutually exclusive (got ${given})`);
    }
    result.bump = resolveBump(result);
    return result;
};

export const parsePerformArgs = (argumentList) => parseCliArgs(argumentList, PERFORM_OPTIONS);
