/**
 * Fallback configuration used when no config file is present.
 */
export const DEFAULT_CONFIG = {
    developmentSuffix: 'alpha',
    tagFormat: '${version}',
    branch: 'main',
    check: ['pnpm install --frozen-lockfile'],
}

/** @typedef {typeof DEFAULT_CONFIG} Config */
