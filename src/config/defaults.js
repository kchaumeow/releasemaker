export const DEFAULT_CONFIG = {
    developmentSuffix: 'alpha',
    tagFormat: 'v${version}',
    releaseBranch: 'main',
    registry: null,
    checks: ['pnpm install --frozen-lockfile', 'pnpm test', 'pnpm build'],
    pack: true,
    package: null,
};
