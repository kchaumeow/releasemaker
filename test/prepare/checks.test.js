import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { runCli } from '../helpers/fixture.js';
import { git } from '../helpers/git-fixture.js';
import { trackFixtures } from '../helpers/release-fixture.js';

const fixture = trackFixtures(after);
const NO_PACK = { pack: false };
const FAST = { checks: ['node -e 0'], pack: false };

test('dry run fails with exit code 4 when a check command is not resolvable', () => {
    // Given
    const { directory, env } = fixture({ config: { checks: ['no-such-command-xyz --flag'] } });

    // When
    const result = runCli(['prepare', '--dry-run'], directory, env);

    // Then
    assert.equal(result.status, 4);
    assert.match(result.stderr, /command "no-such-command-xyz" of check "no-such-command-xyz --flag" was not found/);
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

test('dry run accepts a check composed of shell operators', () => {
    // Given
    const { directory, env } = fixture({ config: { checks: ['cd . && node -e 0'], pack: false } });

    // When
    const result = runCli(['prepare', '--dry-run'], directory, env);

    // Then
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /\[check\] cd \. && node -e 0 \.\.\. not verified \(shell expression/);
});
