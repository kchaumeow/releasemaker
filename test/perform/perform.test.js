import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runCli } from '../helpers/fixture.js';
import { commitAll, git } from '../helpers/git-fixture.js';
import { trackFixtures } from '../helpers/release-fixture.js';

const fixture = trackFixtures(after);

const FAST = { checks: [], pack: false };

/*
 * Runs a real prepare through the CLI so perform tests start from the exact
 * repository state prepare leaves behind: two commits, tag v1.4.0 and the state file.
 */
const preparedFixture = (options = {}) => {
    const created = fixture({ config: FAST, ...options });
    const result = runCli(['prepare'], created.directory, created.env);
    assert.equal(result.status, 0, result.stderr);
    writeFileSync(path.join(created.pnpm.controlDirectory, 'calls.log'), '');
    return created;
};

const pnpmCalls = (pnpm) => pnpm.calls().filter((call) => !call.startsWith('ls '));

const stateExists = (directory) => existsSync(path.join(directory, '.releasemaker', 'release-state.json'));

test('perform without any prepared release fails with exit code 3', () => {
    // Given
    const { directory, env } = fixture({ config: FAST });

    // When
    const result = runCli(['perform'], directory, env);

    // Then
    assert.equal(result.status, 3);
    assert.equal(result.stderr.trim(), '[perform] No prepared release could be resolved.');
});

test('perform resolves the tag from the release state and publishes the packed tarball', () => {
    // Given
    const { directory, env, pnpm } = preparedFixture();
    const head = git(directory, 'rev-parse', 'HEAD');

    // When
    const result = runCli(['perform'], directory, env);

    // Then
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /\[perform\] release tag v1\.4\.0 \(from \.releasemaker\/release-state\.json\)/);
    assert.match(result.stdout, /\[perform\] package @company\/ui@1\.4\.0/);
    assert.match(result.stdout, /\[done\] @company\/ui@1\.4\.0 published/);
    const calls = pnpmCalls(pnpm);
    assert.equal(calls[0], 'view @company/ui@1.4.0 version --json');
    assert.equal(calls[1], 'install --frozen-lockfile');
    assert.equal(calls[2], 'build');
    assert.match(calls[3], /^pack --json --pack-destination .*releasemaker-perform-/);
    assert.match(calls[4], /^publish .*company-ui-1\.4\.0\.tgz --no-git-checks$/);
    assert.equal(git(directory, 'rev-parse', 'HEAD'), head);
    assert.equal(git(directory, 'status', '--porcelain'), '');
    assert.equal(stateExists(directory), false);
    assert.equal(git(directory, 'worktree', 'list').split('\n').length, 1);
});

test('perform resolves the tag from HEAD when checked out on the release tag', () => {
    // Given
    const { directory, env } = preparedFixture();
    git(directory, 'checkout', '--quiet', 'v1.4.0');

    // When
    const result = runCli(['perform', '--dry-run'], directory, env);

    // Then
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /\[perform\] release tag v1\.4\.0 \(from HEAD\)/);
});

test('perform --tag wins over the release state', () => {
    // Given
    const { directory, env } = preparedFixture();
    git(directory, 'tag', '-a', '-m', 'other', 'v9.9.9', 'v1.4.0^{commit}');

    // When
    const result = runCli(['perform', '--tag', 'v9.9.9', '--dry-run'], directory, env);

    // Then
    assert.equal(result.status, 3);
    assert.match(result.stderr, /tag v9\.9\.9 encodes version 9\.9\.9 but the package version at the tag is 1\.4\.0/);
});

test('perform fails when HEAD carries several release tags', () => {
    // Given
    const { directory, env } = preparedFixture();
    git(directory, 'checkout', '--quiet', 'v1.4.0');
    git(directory, 'tag', 'v1.4.1');

    // When
    const result = runCli(['perform', '--dry-run'], directory, env);

    // Then
    assert.equal(result.status, 3);
    assert.match(result.stderr, /HEAD carries several release tags \(v1\.4\.0, v1\.4\.1\); pass --tag/);
});

test('perform --dry-run builds and packs but does not publish or touch the state file', () => {
    // Given
    const { directory, env, pnpm } = preparedFixture();

    // When
    const result = runCli(['perform', '--dry-run'], directory, env);

    // Then
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /\[done\] dry run complete; nothing was published/);
    assert.equal(pnpm.calls().some((call) => call.startsWith('publish')), false);
    assert.equal(pnpm.calls().some((call) => call.startsWith('pack')), true);
    assert.equal(stateExists(directory), true);
});

test('perform --skip-build omits the build step', () => {
    // Given
    const { directory, env, pnpm } = preparedFixture();

    // When
    const result = runCli(['perform', '--skip-build'], directory, env);

    // Then
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /\[build\] skipped \(--skip-build\)/);
    assert.equal(pnpm.calls().includes('build'), false);
});

test('perform --registry overrides the configured registry for view and publish', () => {
    // Given
    const { directory, env, pnpm } = preparedFixture({ config: { ...FAST, registry: 'https://configured.example.com/' } });

    // When
    const result = runCli(['perform', '--registry', 'https://cli.example.com/'], directory, env);

    // Then
    assert.equal(result.status, 0, result.stderr);
    assert.equal(pnpmCalls(pnpm)[0], 'view @company/ui@1.4.0 version --json --registry https://cli.example.com/');
    assert.match(pnpmCalls(pnpm)[4], /--registry https:\/\/cli\.example\.com\/$/);
});

test('perform fails with exit code 6 when the version is already published', () => {
    // Given
    const { directory, env, pnpm } = preparedFixture();
    pnpm.setRegistry({ '@company/ui@1.4.0': 'exists' });

    // When
    const result = runCli(['perform'], directory, env);

    // Then
    assert.equal(result.status, 6);
    assert.match(result.stderr, /@company\/ui@1\.4\.0 is already published; refusing to republish/);
    assert.equal(pnpm.calls().some((call) => call.startsWith('publish')), false);
});

test('perform fails with exit code 6 when the registry is unreachable', () => {
    // Given
    const { directory, env, pnpm } = preparedFixture();
    pnpm.setRegistry({ '@company/ui@1.4.0': 'unreachable' });

    // When
    const result = runCli(['perform'], directory, env);

    // Then
    assert.equal(result.status, 6);
    assert.match(result.stderr, /the registry could not be queried for @company\/ui@1\.4\.0/);
});

test('perform fails with exit code 6 when publish fails and the version is still absent', () => {
    // Given
    const { directory, env, pnpm } = preparedFixture();
    pnpm.setPublish({ exit: 1 });

    // When
    const result = runCli(['perform'], directory, env);

    // Then
    assert.equal(result.status, 6);
    assert.match(result.stderr, /\[publish\] "pnpm publish .* failed with exit code 1/);
    assert.equal(stateExists(directory), true);
});

test('perform fails with exit code 8 when publish fails but the version now exists', () => {
    // Given
    const { directory, env, pnpm } = preparedFixture();
    pnpm.setPublish({ exit: 1, registryAfter: { '@company/ui@1.4.0': 'exists' } });

    // When
    const result = runCli(['perform'], directory, env);

    // Then
    assert.equal(result.status, 8);
    assert.match(result.stderr, /publication likely succeeded, verify the registry/);
});

test('perform fails with exit code 8 when publish fails and the registry state is unknown', () => {
    // Given
    const { directory, env, pnpm } = preparedFixture();
    pnpm.setPublish({ exit: 1, registryAfter: { '@company/ui@1.4.0': 'unreachable' } });

    // When
    const result = runCli(['perform'], directory, env);

    // Then
    assert.equal(result.status, 8);
    assert.match(result.stderr, /registry state of @company\/ui@1\.4\.0 is unknown/);
});

test('perform fails with exit code 4 when the install in the worktree fails', () => {
    // Given
    const { directory, env, pnpm } = preparedFixture();
    pnpm.setFailures({ install: 1 });

    // When
    const result = runCli(['perform'], directory, env);

    // Then
    assert.equal(result.status, 4);
    assert.match(result.stderr, /\[install\] "pnpm install --frozen-lockfile" failed with exit code 1/);
    assert.equal(git(directory, 'worktree', 'list').split('\n').length, 1);
});

test('perform fails when the package version at the tag is a development prerelease', () => {
    // Given
    const { directory, env } = fixture({ config: FAST });
    git(directory, 'tag', 'release-candidate');

    // When
    const result = runCli(['perform', '--tag', 'release-candidate'], directory, env);

    // Then
    assert.equal(result.status, 3);
    assert.match(result.stderr, /package version 1\.4\.0-alpha at release-candidate is a prerelease that the tag does not encode/);
});

test('perform fails when the tag does not exist', () => {
    // Given
    const { directory, env } = fixture({ config: FAST });

    // When
    const result = runCli(['perform', '--tag', 'v0.0.1'], directory, env);

    // Then
    assert.equal(result.status, 3);
    assert.match(result.stderr, /tag "v0\.0\.1" does not exist/);
});

test('perform builds from the tag, not from the current working tree', () => {
    // Given
    const { directory, env, pnpm } = preparedFixture();
    writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name: '@company/ui', version: '9.9.9' }));
    commitAll(directory, 'unrelated later change');

    // When
    const result = runCli(['perform'], directory, env);

    // Then
    assert.equal(result.status, 0, result.stderr);
    assert.match(pnpmCalls(pnpm)[4], /company-ui-1\.4\.0\.tgz/);
});

test('perform selects the workspace package recorded in the release state', () => {
    // Given
    const files = {
        'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
        'packages/ui/package.json': { name: '@company/ui', version: '1.4.0-alpha' },
    };
    const created = fixture({ config: { ...FAST, package: '@company/ui' }, packageJson: { name: 'root', version: '0.0.0', private: true }, files });
    assert.equal(runCli(['prepare'], created.directory, created.env).status, 0);

    // When
    const result = runCli(['perform', '--dry-run'], created.directory, created.env);

    // Then
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /\[perform\] package @company\/ui@1\.4\.0/);
});

test('perform may run from a detached HEAD', () => {
    // Given
    const { directory, env } = preparedFixture();
    git(directory, 'checkout', '--quiet', '--detach', 'HEAD');

    // When
    const result = runCli(['perform', '--dry-run'], directory, env);

    // Then
    assert.equal(result.status, 0, result.stderr);
});

test('perform quotes paths and the registry when calling pnpm', () => {
    // Given
    const { directory, env, pnpm } = preparedFixture({ config: { ...FAST, registry: 'https://r.example.com/with space/' } });

    // When
    const result = runCli(['perform'], directory, env);

    // Then
    assert.equal(result.status, 0, result.stderr);
    assert.equal(pnpmCalls(pnpm)[0], 'view @company/ui@1.4.0 version --json --registry https://r.example.com/with space/');
    assert.match(pnpmCalls(pnpm)[4], /^publish \/.*company-ui-1\.4\.0\.tgz --no-git-checks --registry https:\/\/r\.example\.com\/with space\/$/);
});

test('--package selects a workspace package by path', () => {
    // Given
    const files = {
        'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
        'packages/ui/package.json': { name: '@company/ui', version: '1.4.0-alpha' },
    };
    const { directory, env } = preparedFixture({
        config: { ...FAST, package: 'packages/ui' },
        packageJson: { name: 'root', version: '0.0.0', private: true },
        files,
    });

    // When
    const result = runCli(['perform', '--package', 'packages/ui'], directory, env);

    // Then
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /\[perform\] package @company\/ui@1\.4\.0/);
});

test('a failed worktree checkout leaves no temporary directory behind', () => {
    // Given
    const { directory, env } = preparedFixture();
    const temporary = mkdtempSync(path.join(os.tmpdir(), 'releasemaker-tmpdir-'));
    chmodSync(path.join(directory, '.git'), 0o500);

    // When
    const result = runCli(['perform'], directory, { ...env, TMPDIR: temporary });

    // Then
    chmodSync(path.join(directory, '.git'), 0o700);
    assert.equal(result.status, 5);
    assert.deepEqual(readdirSync(temporary).filter((entry) => entry.startsWith('releasemaker-perform-')), []);
    rmSync(temporary, { recursive: true, force: true });
});

test('a pack output without a filename fails with exit code 4', () => {
    // Given
    const { directory, env, pnpm } = preparedFixture();
    pnpm.setFailures({ packOutput: '[]' });

    // When
    const result = runCli(['perform'], directory, env);

    // Then
    assert.equal(result.status, 4);
    assert.match(result.stderr, /could not read the pnpm pack output/);
});
