import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import { EXIT_CODES, failure } from '../errors.js';
import { DEFAULT_CONFIG } from './defaults.js';
import { checkConfig } from './checker.js';

const CONFIG_FILE_NAMES = ['releasemaker.json', '.releasemakerrc'];

const configError = failure('config', EXIT_CODES.invalidUsage);

const exists = async (filePath) => {
    try {
        await access(filePath);
        return true;
    } catch {
        return false;
    }
};

const findConfigFile = async (directory) => {
    const present = [];
    for (const fileName of CONFIG_FILE_NAMES) {
        if (await exists(path.join(directory, fileName))) {
            present.push(fileName);
        }
    }
    if (present.length > 1) {
        throw configError(`both ${present.join(' and ')} exist; keep exactly one`);
    }
    return present[0];
};

const parseConfigFile = async (directory, fileName) => {
    const text = await readFile(path.join(directory, fileName), 'utf8');
    try {
        return JSON.parse(text);
    } catch (error) {
        throw configError(`${fileName} is not valid JSON: ${error.message}`);
    }
};

export const loadConfig = async (directory) => {
    const fileName = await findConfigFile(directory);
    if (fileName === undefined) {
        return { ...DEFAULT_CONFIG };
    }
    const config = await parseConfigFile(directory, fileName);
    const error = checkConfig(config);
    if (error) {
        throw configError(`${fileName}: ${error}`);
    }
    return { ...DEFAULT_CONFIG, ...config };
};
