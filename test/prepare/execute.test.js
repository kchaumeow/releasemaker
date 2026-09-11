import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { runCli } from '../helpers/fixture.js';
import { git } from '../helpers/git-fixture.js';
import { trackFixtures } from '../helpers/release-fixture.js';

const fixture = trackFixtures(after);
const NO_PACK = { pack: false };
const FAST = { checks: ['node -e 0'], pack: false };

test('pack false in config skips pack validation', () => {
    // Given
    const { directory, env } = fixture({ config: NO_PACK });

    // When
    const result = runCli(['prepare', '--skip-checks'], directory, env);

    // Then
    assert.match(result.stdout, /\[pack\] skipped \(config pack: false\)/);
});

test('--skip-pack skips pack validation', () => {
    // Given
    const { directory, env } = fixture({ config: { checks: [] } });

    // When
    const result = runCli(['prepare', '--skip-pack'], directory, env);

    // Then
    assert.match(result.stdout, /\[pack\] skipped \(--skip-pack\)/);
});

test('prepare creates the release commit, the annotated tag and the development commit', () => {
    // Given
    const { directory, env } = fixture({ config: FAST });

    // When
    const result = runCli(['prepare'], directory, env);

    // Then
    assert.equal(result.status, 0, result.stderr);
    assert.equal(git(directory, 'log', '--format=%s', '-3'), 'chore: prepare development 1.4.1-alpha\nrelease: 1.4.0\ninitial');
    assert.equal(git(directory, 'cat-file', '-t', 'v1.4.0'), 'tag');
    assert.equal(JSON.parse(git(directory, 'show', 'v1.4.0:package.json')).version, '1.4.0');
    assert.equal(JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8')).version, '1.4.1-alpha');
    assert.equal(git(directory, 'status', '--porcelain'), '');
});

test('prepare runs pack, lockfile updates and the registry check through pnpm', () => {
    // Given
    const { directory, env, pnpm } = fixture({ config: { checks: [] } });

    // When
    const result = runCli(['prepare'], directory, env);

    // Then
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(pnpm.calls(), [
        'view @company/ui@1.4.0 version --json',
        'install --lockfile-only --prefer-offline',
        'pack --dry-run',
        'install --lockfile-only --prefer-offline',
    ]);
});

test('prepare writes the release state file', () => {
    // Given
    const { directory, env } = fixture({ config: FAST });

    // When
    runCli(['prepare'], directory, env);

    // Then
    const state = JSON.parse(readFileSync(path.join(directory, '.releasemaker', 'release-state.json'), 'utf8'));
    assert.deepEqual(state, {
        package: '@company/ui',
        releaseVersion: '1.4.0',
        developmentVersion: '1.4.1-alpha',
        tag: 'v1.4.0',
        releaseCommit: git(directory, 'rev-parse', 'v1.4.0^{commit}'),
        developmentCommit: git(directory, 'rev-parse', 'HEAD'),
    });
});

test('prepare warns when .releasemaker is not ignored', () => {
    // Given
    const { directory, env } = fixture({ config: FAST, files: { '.gitignore': 'node_modules/\n' } });

    // When
    const result = runCli(['prepare'], directory, env);

    // Then
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /WARNING: \.releasemaker\/ is not ignored by Git/);
});

test('prepare preserves package.json indentation', () => {
    // Given
    const { directory, env } = fixture({ config: FAST, files: { 'package.json': '{\n    "name": "a",\n    "version": "1.0.0-alpha"\n}\n' } });

    // When
    runCli(['prepare'], directory, env);

    // Then
    assert.equal(readFileSync(path.join(directory, 'package.json'), 'utf8'), '{\n    "name": "a",\n    "version": "1.0.1-alpha"\n}\n');
});

test('failing pack rolls back the version write and leaves no commit or tag', () => {
    // Given
    const { directory, env, pnpm } = fixture({ config: { checks: [] } });
    pnpm.setFailures({ pack: 1 });
    const head = git(directory, 'rev-parse', 'HEAD');

    // When
    const result = runCli(['prepare'], directory, env);

    // Then
    assert.equal(result.status, 4);
    assert.match(result.stderr, /rolled back file changes/);
    assert.equal(git(directory, 'rev-parse', 'HEAD'), head);
    assert.equal(git(directory, 'status', '--porcelain'), '');
    assert.equal(git(directory, 'tag'), '');
    assert.equal(JSON.parse(readFileSync(path.join(directory, 'package.json'), 'utf8')).version, '1.4.0-alpha');
});

test('an unexpected lockfile change fails with exit code 3 and is rolled back', () => {
    // Given
    const { directory, env, pnpm } = fixture({ config: FAST });
    pnpm.setFailures({ lockfileChange: true });
    const head = git(directory, 'rev-parse', 'HEAD');

    // When
    const result = runCli(['prepare'], directory, env);

    // Then
    assert.equal(result.status, 3);
    assert.match(result.stderr, /dependency resolution changed:\n {2}pnpm-lock\.yaml/);
    assert.equal(git(directory, 'rev-parse', 'HEAD'), head);
    assert.equal(git(directory, 'status', '--porcelain'), '');
});

test('a failure after the release tag resets to the starting commit and deletes the tag', () => {
    // Given
    const { directory, env, pnpm } = fixture({ config: FAST });
    pnpm.setFailures({ lockfileChangeOnSecondInstall: true });
    const head = git(directory, 'rev-parse', 'HEAD');

    // When
    const result = runCli(['prepare'], directory, env);

    // Then
    assert.equal(result.status, 3);
    assert.match(result.stderr, /rolled back to /);
    assert.equal(git(directory, 'rev-parse', 'HEAD'), head);
    assert.equal(git(directory, 'tag'), '');
    assert.equal(git(directory, 'status', '--porcelain'), '');
});

test('a failure writing the release state keeps the prepared release and warns', () => {
    // Given
    const { directory, env } = fixture({ config: FAST, files: { '.releasemaker': 'a tracked file blocking the directory' } });

    // When
    const result = runCli(['prepare'], directory, env);

    // Then
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /WARNING: could not write \.releasemaker\/release-state\.json/);
    assert.match(result.stderr, /run "releasemaker perform --tag v1\.4\.0"/);
    assert.equal(git(directory, 'tag'), 'v1.4.0');
    assert.equal(git(directory, 'log', '-1', '--format=%s'), 'chore: prepare development 1.4.1-alpha');
});
