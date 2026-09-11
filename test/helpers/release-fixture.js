import { rmSync } from 'node:fs';
import { createFakePnpm } from './fake-pnpm.js';
import { createGitRepository } from './git-fixture.js';

export const UI_PACKAGE = { name: '@company/ui', version: '1.4.0-alpha' };

/*
 * A releasable repository: clean tree on main with an upstream, a lockfile,
 * and a fake pnpm on PATH so no network or real install is involved.
 */
export const createReleaseFixture = ({ files = {}, config, packageJson = UI_PACKAGE, repository = {} } = {}) => {
    const filesByName = { 'package.json': packageJson, 'pnpm-lock.yaml': "lockfileVersion: '9.0'\n", ...files };
    if (config !== undefined) {
        filesByName['releasemaker.json'] = config;
    }
    const created = createGitRepository(filesByName, repository);
    const pnpm = createFakePnpm();
    return {
        ...created,
        pnpm,
        env: pnpm.env,
        remove: () => {
            rmSync(created.root, { recursive: true, force: true });
            rmSync(pnpm.controlDirectory, { recursive: true, force: true });
        },
    };
};

export const trackFixtures = (after) => {
    const fixtures = [];
    after(() => fixtures.forEach((fixture) => fixture.remove()));
    return (options) => {
        const fixture = createReleaseFixture(options);
        fixtures.push(fixture);
        return fixture;
    };
};
