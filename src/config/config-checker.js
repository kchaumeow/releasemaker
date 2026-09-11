import { DEFAULT_CONFIG } from './default-config.js'

/**
 * Validates a parsed config against the shape of the defaults and returns the first error message found.
 * @param {unknown} config
 * @returns {string | undefined}
 */
export const checkConfig = (config) => {
    if (config === null || Array.isArray(config) || typeof config !== 'object') {
        return 'Config must be an object'
    }
    for (const [property, defaultValue] of Object.entries(DEFAULT_CONFIG)) {
        if (!Object.hasOwn(config, property)) {
            continue
        }
        const error = checkPropertyMatchesDefaultType(config[property], defaultValue, property)
        if (error) {
            return error
        }
    }
}

/**
 * Returns an error message when a value does not have the type of its default counterpart.
 * @param {unknown} value
 * @param {string | string[]} defaultValue
 * @param {string} property
 * @returns {string | undefined}
 */
const checkPropertyMatchesDefaultType = (value, defaultValue, property) => {
    if (Array.isArray(defaultValue)) {
        if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
            return `Config.${property} must be an array of strings`
        }
        return
    }
    if (typeof value !== typeof defaultValue) {
        return `Config.${property} must be a ${typeof defaultValue}`
    }
}
