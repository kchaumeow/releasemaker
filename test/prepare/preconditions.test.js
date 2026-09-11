import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { runCli } from '../helpers/fixture.js';
import { commitAll, git } from '../helpers/git-fixture.js';
import { trackFixtures } from '../helpers/release-fixture.js';

const fixture = trackFixtures(after);
const FAST = { checks: ['node -e 0'], pack: false };

test('existing local tag fails with exit code 3 before any commit', () => {
    // Given
    const { directory, env } = fixture({ config: FAST });
    git(directory, 'tag', 'v1.4.0');
    const head = git(directory, 'rev-parse', 'HEAD');

    // When
    const result = runCli(['prepare'], directory, env);

    // Then
    assert.equal(result.status, 3);
    assert.match(result.stderr, /tag "v1\.4\.0" already exists/);
    assert.equal(git(directory, 'rev-parse', 'HEAD'), head);
});

test('tag existing only on the remote fails with exit code 3', () => {
    // Given
    const { directory, env } = fixture({ config: FAST });
    git(directory, 'tag', 'v1.4.0');
    git(directory, 'push', '--quiet', 'origin', 'v1.4.0');
    git(directory, 'tag', '--delete', 'v1.4.0');

    // When
    const result = runCli(['prepare'], directory, env);

    // Then
    assert.equal(result.status, 3);
    assert.match(result.stderr, /tag "v1\.4\.0" already exists on remote "origin"/);
});

test('already published version fails with exit code 3', () => {
    // Given
    const { directory, env, pnpm } = fixture({ config: FAST });
    pnpm.setRegistry({ '@company/ui@1.4.0': 'exists' });

    // When
    const result = runCli(['prepare'], directory, env);

    // Then
    assert.equal(result.status, 3);
    assert.match(result.stderr, /version 1\.4\.0 of @company\/ui is already published/);
});

test('unreachable registry fails closed in non-interactive mode', () => {
    // Given
    const { directory, env, pnpm } = fixture({ config: FAST });
    pnpm.setRegistry({ '@company/ui@1.4.0': 'unreachable' });

    // When
    const result = runCli(['prepare', '--dry-run'], directory, env);

    // Then
    assert.equal(result.status, 3);
    assert.match(result.stderr, /WARNING: the registry could not be queried for @company\/ui@1\.4\.0: ERR_PNPM_META_FETCH_FAIL/);
    assert.match(result.stderr, /refusing to continue non-interactively/);
});

test('dirty working tree fails with exit code 3 listing the paths', () => {
    // Given
    const { directory, env } = fixture({ config: FAST });
    writeFileSync(path.join(directory, 'notes.txt'), 'wip');

    // When
    const result = runCli(['prepare'], directory, env);

    // Then
    assert.equal(result.status, 3);
    assert.match(result.stderr, /working tree has uncommitted changes:\n {2}notes\.txt/);
});

test('detached HEAD fails with exit code 3', () => {
    // Given
    const { directory, env } = fixture({ config: FAST });
    git(directory, 'checkout', '--quiet', '--detach');

    // When
    const result = runCli(['prepare'], directory, env);

    // Then
    assert.equal(result.status, 3);
    assert.match(result.stderr, /HEAD is detached/);
});

test('branch outside releaseBranch fails with exit code 3', () => {
    // Given
    const { directory, env } = fixture({ config: FAST });
    git(directory, 'checkout', '--quiet', '-b', 'feature');

    // When
    const result = runCli(['prepare'], directory, env);

    // Then
    assert.equal(result.status, 3);
    assert.match(result.stderr, /branch "feature" is not a release branch \(allowed: main\)/);
});

test('missing lockfile fails with exit code 3 unless .npmrc disables it', () => {
    // Given
    const withoutLockfile = fixture({ config: FAST });
    git(withoutLockfile.directory, 'rm', '--quiet', 'pnpm-lock.yaml');
    commitAll(withoutLockfile.directory, 'drop lockfile');
    const disabled = fixture({ config: FAST, files: { '.npmrc': 'lockfile=false\n' } });
    git(disabled.directory, 'rm', '--quiet', 'pnpm-lock.yaml');
    commitAll(disabled.directory, 'drop lockfile');

    // When
    const failing = runCli(['prepare', '--dry-run'], withoutLockfile.directory, withoutLockfile.env);
    const passing = runCli(['prepare', '--dry-run'], disabled.directory, disabled.env);

    // Then
    assert.equal(failing.status, 3);
    assert.match(failing.stderr, /pnpm-lock\.yaml is missing/);
    assert.equal(passing.status, 0, passing.stderr);
});

test('branch behind its upstream fails with exit code 3', () => {
    // Given
    const { directory, env, remote, root } = fixture({ config: FAST });
    const clone = path.join(root, 'clone');
    git(root, 'clone', '--quiet', remote, clone);
    git(clone, 'config', 'user.name', 'Other');
    git(clone, 'config', 'user.email', 'other@example.com');
    writeFileSync(path.join(clone, 'other.txt'), 'x');
    commitAll(clone, 'remote change');
    git(clone, 'push', '--quiet', 'origin', 'main');

    // When
    const result = runCli(['prepare'], directory, env);

    // Then
    assert.equal(result.status, 3);
    assert.match(result.stderr, /branch "main" is behind or has diverged from origin\/main/);
});

test('branch ahead of its upstream is allowed', () => {
    // Given
    const { directory, env } = fixture({ config: FAST });
    writeFileSync(path.join(directory, 'local.txt'), 'x');
    commitAll(directory, 'local change');

    // When
    const result = runCli(['prepare', '--dry-run'], directory, env);

    // Then
    assert.equal(result.status, 0, result.stderr);
});

test('missing upstream fails closed in non-interactive mode', () => {
    // Given
    const { directory, env } = fixture({ config: FAST, repository: { withRemote: false } });

    // When
    const result = runCli(['prepare', '-y'], directory, env);

    // Then
    assert.equal(result.status, 3);
    assert.match(result.stderr, /branch "main" has no upstream/);
});

test('unreachable remote fails closed in non-interactive mode', () => {
    // Given
    const { directory, env } = fixture({ config: FAST });
    git(directory, 'remote', 'set-url', 'origin', '/nonexistent/origin.git');

    // When
    const result = runCli(['prepare'], directory, env);

    // Then
    assert.equal(result.status, 3);
    assert.match(result.stderr, /remote "origin" is not reachable/);
});

test('prepare below the repository root fails with exit code 3', () => {
    // Given
    const { directory, env } = fixture({ config: FAST, files: { 'packages/ui/package.json': { name: '@company/ui', version: '1.4.0-alpha' } } });

    // When
    const result = runCli(['prepare'], path.join(directory, 'packages', 'ui'), env);

    // Then
    assert.equal(result.status, 3);
    assert.match(result.stderr, /prepare must run in the repository root/);
});
