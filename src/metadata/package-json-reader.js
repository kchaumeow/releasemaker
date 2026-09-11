import { readFile } from 'node:fs/promises'

const PACKAGE_JSON_PATH = 'package.json'

/**
 * @typedef {object} PackageMetadata
 * @property {string} name
 * @property {string} version
 * @property {Record<string, string>} scripts The `scripts` map, `{}` when package.json defines none.
 */

/**
 * Reads the package.json of the current working directory and returns its name, version and scripts.
 * @returns {Promise<PackageMetadata>}
 */
export const readPackageJson = async () => {
    const packageJson = JSON.parse(await readFile(PACKAGE_JSON_PATH, 'utf8'))
    const error = checkPackageJson(packageJson)
    if (error) {
        throw new Error(error)
    }
    return { name: packageJson.name, version: packageJson.version, scripts: packageJson.scripts ?? {} }
}

/**
 * Returns the first error message found when name or version are missing or not strings,
 * or when scripts is present but not an object of strings.
 * @param {unknown} packageJson
 * @returns {string | undefined}
 */
const checkPackageJson = (packageJson) => {
    if (packageJson === null || Array.isArray(packageJson) || typeof packageJson !== 'object') {
        return 'package.json must be an object'
    }
    for (const property of ['name', 'version']) {
        if (typeof packageJson[property] !== 'string' || packageJson[property] === '') {
            return `package.json.${property} must be a non-empty string`
        }
    }
    if (packageJson.scripts !== undefined && !isStringRecord(packageJson.scripts)) {
        return 'package.json.scripts must be an object of strings'
    }
}

/**
 * Whether a value is a plain object whose values are all strings.
 * @param {unknown} value
 * @returns {boolean}
 */
const isStringRecord = (value) =>
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.values(value).every((item) => typeof item === 'string')
