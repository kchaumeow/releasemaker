import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { EXIT_CODES, ReleasemakerError } from '../errors.js';

const preconditionError = (message) => new ReleasemakerError(`[prepare] ${message}`, EXIT_CODES.preconditionFailure);

const readPackageJsonText = async (directory) => {
    try {
        return await readFile(path.join(directory, 'package.json'), 'utf8');
    } catch (error) {
        if (error.code === 'ENOENT') {
            throw preconditionError(`no package.json in ${directory}`);
        }
        throw error;
    }
};

const checkPackageJson = (packageJson) => {
    if (packageJson === null || Array.isArray(packageJson) || typeof packageJson !== 'object') {
        return 'package.json must be an object';
    }
    for (const property of ['name', 'version']) {
        if (typeof packageJson[property] !== 'string' || packageJson[property] === '') {
            return `package.json.${property} must be a non-empty string`;
        }
    }
    if (packageJson.private !== undefined && typeof packageJson.private !== 'boolean') {
        return 'package.json.private must be a boolean';
    }
    return undefined;
};

export const readPackageJson = async (directory) => {
    const text = await readPackageJsonText(directory);
    let packageJson;
    try {
        packageJson = JSON.parse(text);
    } catch (error) {
        throw preconditionError(`package.json is not valid JSON: ${error.message}`);
    }
    const error = checkPackageJson(packageJson);
    if (error) {
        throw preconditionError(error);
    }
    return { name: packageJson.name, version: packageJson.version, private: packageJson.private === true };
};
