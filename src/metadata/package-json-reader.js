import { readFile } from 'node:fs/promises'

const PACKAGE_JSON_PATH = 'package.json'

/**
 * @typedef {object} PackageMetadata
 * @property {string} name
 * @property {string} version
 */

/**
 * Reads the package.json of the current working directory and returns its name and version.
 * @returns {Promise<PackageMetadata>}
 */
export const readPackageJson = async () => {
    const packageJson = JSON.parse(await readFile(PACKAGE_JSON_PATH, 'utf8'))
    const error = checkPackageJson(packageJson)
    if (error) {
        throw new Error(error)
    }
    return { name: packageJson.name, version: packageJson.version }
}

/**
 * Returns the first error message found when name or version are missing or not strings.
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
}
