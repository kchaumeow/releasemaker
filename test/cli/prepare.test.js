import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { runCli } from '../helpers/fixture.js';
import { commitAll, git } from '../helpers/git-fixture.js';
import { trackFixtures, UI_PACKAGE } from '../helpers/release-fixture.js';

const fixture = trackFixtures(after);

const NO_PACK = { pack: false };
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

test('dry run fails with exit code 4 when a check command is not resolvable', () => {
    // Given
    const { directory, env } = fixture({ config: { checks: ['no-such-command-xyz --flag'] } });

    // When
    const result = runCli(['prepare', '--dry-run'], directory, env);

    // Then
    assert.equal(result.status, 4);
    assert.match(result.stderr, /command "no-such-command-xyz" of check "no-such-command-xyz --flag" was not found/);
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

test('--skip-checks prints a warning on stderr listing the skipped commands', () => {
    // Given
    const { directory, env } = fixture({ config: NO_PACK });

    // When
    const result = runCli(['prepare', '--skip-checks'], directory, env);

    // Then
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stderr, /WARNING: --skip-checks given; the configured checks were NOT run:\n {2}pnpm install --frozen-lockfile/);
});

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

test('normal run executes configured checks through the shell', () => {
    // Given
    const { directory, env } = fixture({ config: FAST });

    // When
    const result = runCli(['prepare'], directory, env);

    // Then
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /\[check\] node -e 0 \.\.\. ok/);
});

test('failing check exits 4 and reports the exit code', () => {
    // Given
    const { directory, env } = fixture({ config: { checks: ['node -e "process.exit(3)"'], pack: false } });

    // When
    const result = runCli(['prepare'], directory, env);

    // Then
    assert.equal(result.status, 4);
    assert.match(result.stderr, /\[check\] "node -e "process\.exit\(3\)"" failed with exit code 3/);
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

test('a check that modifies tracked files fails with exit code 4 and nothing is committed', () => {
    // Given
    const config = { checks: ['node -e "require(\'fs\').writeFileSync(\'README.md\', \'changed\')"'], pack: false };
    const { directory, env } = fixture({ config, files: { 'README.md': 'original' } });
    const head = git(directory, 'rev-parse', 'HEAD');

    // When
    const result = runCli(['prepare'], directory, env);

    // Then
    assert.equal(result.status, 4);
    assert.match(result.stderr, /the checks modified tracked files or left untracked files behind:\n {2}README\.md/);
    assert.equal(git(directory, 'rev-parse', 'HEAD'), head);
    assert.equal(git(directory, 'tag'), '');
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
