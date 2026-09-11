import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { createFixture, removeFixture, runCli } from '../helpers/fixture.js';

const fixtures = [];
const fixture = (files) => {
    const directory = createFixture(files);
    fixtures.push(directory);
    return directory;
};
after(() => fixtures.forEach(removeFixture));

const uiPackage = { name: '@company/ui', version: '1.4.0-alpha' };

test('dry run prints the release plan from the spec', () => {
    // Given
    const directory = fixture({ 'package.json': uiPackage });

    // When
    const result = runCli(['prepare', '--dry-run'], directory);

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

test('dry run does not execute checks or pack', () => {
    // Given
    const directory = fixture({ 'package.json': uiPackage });

    // When
    const result = runCli(['prepare', '--dry-run'], directory);

    // Then
    assert.match(result.stdout, /\[check\] not executed \(dry run\)/);
    assert.match(result.stdout, /\[pack\] pnpm pack --dry-run \(not executed\)/);
    assert.match(result.stdout, /\[done\] dry run complete; nothing was changed/);
});

test('--minor from a prerelease bumps the stable core', () => {
    // Given
    const directory = fixture({ 'package.json': { name: 'a', version: '1.4.3-alpha' } });

    // When
    const result = runCli(['prepare', '--minor', '--dry-run'], directory);

    // Then
    assert.match(result.stdout, /Release version:      1\.5\.0/);
    assert.match(result.stdout, /Development version:  1\.5\.1-alpha/);
    assert.match(result.stdout, /Tag:                  v1\.5\.0/);
});

test('configured tagFormat is applied', () => {
    // Given
    const directory = fixture({ 'package.json': uiPackage, 'releasemaker.json': { tagFormat: 'ui-v${version}' } });

    // When
    const result = runCli(['prepare', '--dry-run'], directory);

    // Then
    assert.match(result.stdout, /Tag:                  ui-v1\.4\.0/);
});

test('--tag overrides the configured tagFormat', () => {
    // Given
    const directory = fixture({ 'package.json': uiPackage });

    // When
    const result = runCli(['prepare', '--dry-run', '--tag', 'custom'], directory);

    // Then
    assert.match(result.stdout, /Tag:                  custom/);
});

test('releaseBranch array and registry are printed', () => {
    // Given
    const config = { releaseBranch: ['main', 'release'], registry: 'https://registry.example.com/' };
    const directory = fixture({ 'package.json': uiPackage, 'releasemaker.json': config });

    // When
    const result = runCli(['prepare', '--dry-run'], directory);

    // Then
    assert.match(result.stdout, /Release branch:       main, release/);
    assert.match(result.stdout, /Registry:             https:\/\/registry\.example\.com\//);
});

test('private package fails with exit code 3', () => {
    // Given
    const directory = fixture({ 'package.json': { ...uiPackage, private: true } });

    // When
    const result = runCli(['prepare', '--dry-run'], directory);

    // Then
    assert.equal(result.status, 3);
    assert.match(result.stderr, /package "@company\/ui" is private and cannot be published/);
});

test('missing version fails with exit code 3', () => {
    // Given
    const directory = fixture({ 'package.json': { name: 'a' } });

    // When
    const result = runCli(['prepare', '--dry-run'], directory);

    // Then
    assert.equal(result.status, 3);
});

test('release version lower than current fails with exit code 3', () => {
    // Given
    const directory = fixture({ 'package.json': uiPackage });

    // When
    const result = runCli(['prepare', '-r', '1.3.0'], directory);

    // Then
    assert.equal(result.status, 3);
    assert.match(result.stderr, /release version 1\.3\.0 must be greater than current version 1\.4\.0-alpha/);
});

test('two bump flags fail with exit code 2', () => {
    // Given
    const directory = fixture({ 'package.json': uiPackage });

    // When
    const result = runCli(['prepare', '--patch', '--major'], directory);

    // Then
    assert.equal(result.status, 2);
});

test('both config files fail with exit code 2', () => {
    // Given
    const directory = fixture({ 'package.json': uiPackage, 'releasemaker.json': {}, '.releasemakerrc': {} });

    // When
    const result = runCli(['prepare', '--dry-run'], directory);

    // Then
    assert.equal(result.status, 2);
    assert.match(result.stderr, /both releasemaker\.json and \.releasemakerrc exist/);
});

test('unknown config key fails with exit code 2', () => {
    // Given
    const directory = fixture({ 'package.json': uiPackage, 'releasemaker.json': { branch: 'main' } });

    // When
    const result = runCli(['prepare', '--dry-run'], directory);

    // Then
    assert.equal(result.status, 2);
    assert.match(result.stderr, /unknown key "branch"/);
});

test('--package fails as unsupported with exit code 2', () => {
    // Given
    const directory = fixture({ 'package.json': uiPackage });

    // When
    const result = runCli(['prepare', '--dry-run', '-p', 'packages/ui'], directory);

    // Then
    assert.equal(result.status, 2);
    assert.match(result.stderr, /workspace package selection is not supported yet/);
});

test('--skip-checks prints a warning on stderr listing the skipped commands', () => {
    // Given
    const directory = fixture({ 'package.json': uiPackage, 'releasemaker.json': { pack: false } });

    // When
    const result = runCli(['prepare', '--skip-checks'], directory);

    // Then
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /WARNING: --skip-checks given; the configured checks were NOT run:\n {2}pnpm install --frozen-lockfile/);
});

test('pack false in config skips pack validation', () => {
    // Given
    const directory = fixture({ 'package.json': uiPackage, 'releasemaker.json': { pack: false } });

    // When
    const result = runCli(['prepare', '--dry-run'], directory);

    // Then
    assert.match(result.stdout, /\[pack\] skipped \(config pack: false\)/);
});

test('--skip-pack skips pack validation', () => {
    // Given
    const directory = fixture({ 'package.json': uiPackage });

    // When
    const result = runCli(['prepare', '--dry-run', '--skip-pack'], directory);

    // Then
    assert.match(result.stdout, /\[pack\] skipped \(--skip-pack\)/);
});

test('normal run executes configured checks through the shell', () => {
    // Given
    const config = { checks: ['node -e 0'], pack: false };
    const directory = fixture({ 'package.json': uiPackage, 'releasemaker.json': config });

    // When
    const result = runCli(['prepare'], directory);

    // Then
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /\[check\] node -e 0 \.\.\. ok/);
    assert.match(result.stdout, /\[prepare\] stopping before Git mutations/);
});

test('failing check exits 4 and reports the exit code', () => {
    // Given
    const config = { checks: ['node -e "process.exit(3)"'], pack: false };
    const directory = fixture({ 'package.json': uiPackage, 'releasemaker.json': config });

    // When
    const result = runCli(['prepare'], directory);

    // Then
    assert.equal(result.status, 4);
    assert.match(result.stderr, /\[check\] "node -e "process\.exit\(3\)"" failed with exit code 3/);
});

test('normal run prints phase-prefixed plan lines', () => {
    // Given
    const directory = fixture({ 'package.json': uiPackage, 'releasemaker.json': { checks: [], pack: false } });

    // When
    const result = runCli(['prepare'], directory);

    // Then
    assert.match(result.stdout, /\[prepare\] package @company\/ui\n\[prepare\] 1\.4\.0-alpha -> 1\.4\.0 -> 1\.4\.1-alpha\n\[prepare\] tag v1\.4\.0/);
});
