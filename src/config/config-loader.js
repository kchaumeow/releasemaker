import { readFile } from 'node:fs/promises'
import { DEFAULT_CONFIG } from './default-config.js'
import { checkConfig } from './config-checker.js'

const CONFIG_PATHS = ['releasemaker.json', '.releasemakerrc']

/**
 * Loads the config from the first existing config file, filling gaps with defaults.
 * @returns {Promise<import('./default-config.js').Config>}
 */
export const loadConfig = async () => {
    const configText = await readFirstExistingFile(CONFIG_PATHS)
    let config = {}
    if (configText !== undefined) {
        config = JSON.parse(configText)
        const error = checkConfig(config)
        if (error) {
            throw new Error(error)
        }
    }
    return { ...structuredClone(DEFAULT_CONFIG), ...config }
}

/**
 * Reads the first file among the given paths that exists.
 * @param {string[]} paths
 * @returns {Promise<string | undefined>}
 */
const readFirstExistingFile = async (paths) => {
    for (const path of paths) {
        try {
            return await readFile(path, 'utf8')
        } catch (error) {
            if (error.code !== 'ENOENT') {
                throw error
            }
        }
    }
}
