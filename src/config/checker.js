import semver from 'semver';

const isNonEmptyString = (value) => typeof value === 'string' && value !== '';

const isNonEmptyStringArray = (value) => Array.isArray(value) && value.length > 0 && value.every(isNonEmptyString);

const isPrereleaseIdentifier = (value) => isNonEmptyString(value) && semver.valid(`0.0.0-${value}`) === `0.0.0-${value}`;

const isTagFormat = (value) => typeof value === 'string' && value.split('${version}').length === 2;

const isStringOrStringArray = (value) => isNonEmptyString(value) || isNonEmptyStringArray(value);

const isStringOrNull = (value) => value === null || isNonEmptyString(value);

const isStringArray = (value) => Array.isArray(value) && value.every(isNonEmptyString);

const isBoolean = (value) => typeof value === 'boolean';

const CONFIG_RULES = {
    developmentSuffix: ['a valid SemVer prerelease identifier', isPrereleaseIdentifier],
    tagFormat: ['a string containing ${version} exactly once', isTagFormat],
    releaseBranch: ['a non-empty string or a non-empty array of strings', isStringOrStringArray],
    registry: ['a string or null', isStringOrNull],
    checks: ['an array of non-empty strings', isStringArray],
    pack: ['a boolean', isBoolean],
    package: ['a string or null', isStringOrNull],
};

export const checkConfig = (config) => {
    if (config === null || Array.isArray(config) || typeof config !== 'object') {
        return 'Config must be an object';
    }
    for (const [property, value] of Object.entries(config)) {
        const rule = CONFIG_RULES[property];
        if (rule === undefined) {
            return `Config has unknown key "${property}"; allowed keys: ${Object.keys(CONFIG_RULES).join(', ')}`;
        }
        const [description, isValid] = rule;
        if (!isValid(value)) {
            return `Config.${property} must be ${description}`;
        }
    }
    return undefined;
};
