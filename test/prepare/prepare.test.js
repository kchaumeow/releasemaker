import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { runCli } from '../helpers/fixture.js';
import { git } from '../helpers/git-fixture.js';
import { trackFixtures, UI_PACKAGE } from '../helpers/release-fixture.js';

const fixture = trackFixtures(after);
const FAST = { checks: ['node -e 0'], pack: false };

test('dry run prints the release plan from the spec', () => {
    // Given
    const { directory, env } = fixture();

    // When
    const result = runCli(['prepare', '--dry-run'], directory, env);

    // Then
    assert.equal(result.status, 0, result.stderr);
    const expected = [
        'Package:              @company/ui',
        'Current version:      1.4.0-alpha',
        'Release version:      1.4.0',
        'Development version:  1.4.1-alpha',
        'Tag:                  v1.4.0',
        'Release branch:       main',
        'Registry:             (pnpm default)',
        '',
        'Checks:',
        '  pnpm install --frozen-lockfile',
        '  pnpm test',
        '  pnpm build',
        '',
        'Would create commits:',
        '  release: 1.4.0',
        '  chore: prepare development 1.4.1-alpha',
        '',
        'Would create tag:',
        '  v1.4.0',
    ].join('\n');
    assert.ok(result.stdout.startsWith(expected), result.stdout);
});

test('dry run only queries the registry and changes nothing', () => {
    // Given
    const { directory, env, pnpm } = fixture();
    const head = git(directory, 'rev-parse', 'HEAD');

    // When
    const result = runCli(['prepare', '--dry-run'], directory, env);

    // Then
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /\[check\] pnpm test \.\.\. resolvable \(not executed in dry run\)/);
    assert.match(result.stdout, /\[done\] dry run complete; nothing was changed/);
    assert.deepEqual(pnpm.calls(), ['view @company/ui@1.4.0 version --json']);
    assert.equal(git(directory, 'rev-parse', 'HEAD'), head);
    assert.equal(git(directory, 'status', '--porcelain'), '');
    assert.equal(existsSync(path.join(directory, '.releasemaker')), false);
});

test('--minor from a prerelease bumps the stable core', () => {
    // Given
    const { directory, env } = fixture({ packageJson: { name: 'a', version: '1.4.3-alpha' } });

    // When
    const result = runCli(['prepare', '--minor', '--dry-run'], directory, env);

    // Then
    assert.match(result.stdout, /Release version:      1\.5\.0/);
    assert.match(result.stdout, /Development version:  1\.5\.1-alpha/);
    assert.match(result.stdout, /Tag:                  v1\.5\.0/);
});

test('configured tagFormat is applied', () => {
    // Given
    const { directory, env } = fixture({ config: { tagFormat: 'ui-v${version}' } });

    // When
    const result = runCli(['prepare', '--dry-run'], directory, env);

    // Then
    assert.match(result.stdout, /Tag:                  ui-v1\.4\.0/);
});

test('--tag overrides the configured tagFormat', () => {
    // Given
    const { directory, env } = fixture();

    // When
    const result = runCli(['prepare', '--dry-run', '--tag', 'custom'], directory, env);

    // Then
    assert.match(result.stdout, /Tag:                  custom/);
});

test('releaseBranch array and registry are printed and passed to pnpm view', () => {
    // Given
    const config = { releaseBranch: ['main', 'release'], registry: 'https://registry.example.com/' };
    const { directory, env, pnpm } = fixture({ config });

    // When
    const result = runCli(['prepare', '--dry-run'], directory, env);

    // Then
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Release branch:       main, release/);
    assert.match(result.stdout, /Registry:             https:\/\/registry\.example\.com\//);
    assert.deepEqual(pnpm.calls(), ['view @company/ui@1.4.0 version --json --registry https://registry.example.com/']);
});

test('private package fails with exit code 3', () => {
    // Given
    const { directory, env } = fixture({ packageJson: { ...UI_PACKAGE, private: true } });

    // When
    const result = runCli(['prepare', '--dry-run'], directory, env);

    // Then
    assert.equal(result.status, 3);
    assert.match(result.stderr, /package "@company\/ui" is private and cannot be published/);
});

test('missing version fails with exit code 3', () => {
    // Given
    const { directory, env } = fixture({ packageJson: { name: 'a' } });

    // When
    const result = runCli(['prepare', '--dry-run'], directory, env);

    // Then
    assert.equal(result.status, 3);
});

test('release version lower than current fails with exit code 3', () => {
    // Given
    const { directory, env } = fixture();

    // When
    const result = runCli(['prepare', '-r', '1.3.0', '-y'], directory, env);

    // Then
    assert.equal(result.status, 3);
    assert.match(result.stderr, /release version 1\.3\.0 must be greater than current version 1\.4\.0-alpha/);
});

test('two bump flags fail with exit code 2', () => {
    // Given
    const { directory, env } = fixture();

    // When
    const result = runCli(['prepare', '--patch', '--major'], directory, env);

    // Then
    assert.equal(result.status, 2);
});

test('both config files fail with exit code 2', () => {
    // Given
    const { directory, env } = fixture({ files: { 'releasemaker.json': {}, '.releasemakerrc': {} } });

    // When
    const result = runCli(['prepare', '--dry-run'], directory, env);

    // Then
    assert.equal(result.status, 2);
    assert.match(result.stderr, /both releasemaker\.json and \.releasemakerrc exist/);
});

test('unknown config key fails with exit code 2', () => {
    // Given
    const { directory, env } = fixture({ config: { branch: 'main' } });

    // When
    const result = runCli(['prepare', '--dry-run'], directory, env);

    // Then
    assert.equal(result.status, 2);
    assert.match(result.stderr, /unknown key "branch"/);
});

test('normal run prints phase-prefixed plan and git lines', () => {
    // Given
    const { directory, env } = fixture({ config: FAST });

    // When
    const result = runCli(['prepare'], directory, env);

    // Then
    assert.match(result.stdout, /\[prepare\] package @company\/ui\n\[prepare\] 1\.4\.0-alpha -> 1\.4\.0 -> 1\.4\.1-alpha\n\[prepare\] tag v1\.4\.0/);
    assert.match(result.stdout, /\[git\] commit release: 1\.4\.0\n\[git\] tag v1\.4\.0\n/);
    assert.match(result.stdout, /\[git\] commit chore: prepare development 1\.4\.1-alpha\n\[done\] release v1\.4\.0 prepared/);
});

test('--package selects a workspace package by name and commits only its package.json', () => {
    // Given
    const files = {
        'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
        'packages/ui/package.json': { name: '@company/ui', version: '1.4.0-alpha' },
        'packages/core/package.json': { name: '@company/core', version: '2.0.0-alpha', private: true },
    };
    const { directory, env } = fixture({ config: FAST, packageJson: { name: 'root', version: '0.0.0', private: true }, files });

    // When
    const result = runCli(['prepare', '-p', '@company/ui'], directory, env);

    // Then
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(git(directory, 'show', 'v1.4.0:packages/ui/package.json')).version, '1.4.0');
    assert.equal(JSON.parse(git(directory, 'show', 'v1.4.0:package.json')).version, '0.0.0');
    assert.equal(git(directory, 'show', '--stat', '--format=', 'v1.4.0').includes('packages/ui/package.json'), true);
});

test('--package selects a workspace package by path in a dry run', () => {
    // Given
    const files = {
        'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
        'packages/ui/package.json': { name: '@company/ui', version: '1.4.0-alpha' },
    };
    const { directory, env } = fixture({ config: FAST, packageJson: { name: 'root', version: '0.0.0', private: true }, files });

    // When
    const result = runCli(['prepare', '--dry-run', '-p', 'packages/ui'], directory, env);

    // Then
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Package:              @company\/ui\nPackage directory:    packages\/ui/);
});

test('--package matching no package fails with exit code 3', () => {
    // Given
    const { directory, env } = fixture({ config: FAST });

    // When
    const result = runCli(['prepare', '--dry-run', '-p', 'packages/ui'], directory, env);

    // Then
    assert.equal(result.status, 3);
    assert.match(result.stderr, /"packages\/ui" matches no workspace package/);
});

test('private workspace root without a selector fails with exit code 3 in non-interactive mode', () => {
    // Given
    const files = {
        'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
        'packages/ui/package.json': { name: '@company/ui', version: '1.4.0-alpha' },
    };
    const { directory, env } = fixture({ config: FAST, packageJson: { name: 'root', version: '0.0.0', private: true }, files });

    // When
    const result = runCli(['prepare', '--dry-run'], directory, env);

    // Then
    assert.equal(result.status, 3);
    assert.match(result.stderr, /the workspace root is private; select a package with --package/);
});

test('config package selects the workspace package', () => {
    // Given
    const files = {
        'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
        'packages/ui/package.json': { name: '@company/ui', version: '1.4.0-alpha' },
    };
    const config = { ...FAST, package: '@company/ui' };
    const { directory, env } = fixture({ config, packageJson: { name: 'root', version: '0.0.0', private: true }, files });

    // When
    const result = runCli(['prepare', '--dry-run'], directory, env);

    // Then
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Package:              @company\/ui/);
});
