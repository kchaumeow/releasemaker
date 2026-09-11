import { parseArgs } from 'node:util';
import { EXIT_CODES, ReleasemakerError } from '../errors.js';
import { PREPARE_OPTIONS, RELEASE_SELECTORS } from './constants.js';

const toCamelCase = (name) => name.replace(/-([a-z])/g, (match, letter) => letter.toUpperCase());

const usageError = (message) => new ReleasemakerError(`[usage] ${message}`, EXIT_CODES.invalidUsage);

const parseRawValues = (argumentList) => {
    try {
        return parseArgs({ args: argumentList, options: PREPARE_OPTIONS, strict: true, allowPositionals: false }).values;
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

export const parseCliArgs = (argumentList) => {
    const values = parseRawValues(argumentList);

    const selectors = RELEASE_SELECTORS.filter((name) => values[name] !== undefined && values[name] !== false);
    if (selectors.length > 1) {
        const given = selectors.map((name) => `--${name}`).join(', ');
        throw usageError(`--release-version, --patch, --minor, --major are mutually exclusive (got ${given})`);
    }

    const result = {};
    for (const [name, option] of Object.entries(PREPARE_OPTIONS)) {
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
    result.bump = resolveBump(values);
    return result;
};
