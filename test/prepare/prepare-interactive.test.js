import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { prepare } from '../../src/prepare/prepare.js';
import { git } from '../helpers/git-fixture.js';
import { trackFixtures } from '../helpers/release-fixture.js';

const fixture = trackFixtures(after);

const FAST = { checks: [], pack: false };

/*
 * Answers are typed one per prompt. prepare() runs in-process so the fake pnpm
 * must be placed on this process's PATH for the duration of the call.
 */
const runInteractive = async (argumentList, created, answers) => {
    const pending = [...answers];
    const input = new PassThrough();
    const output = new PassThrough();
    let transcript = '';
    output.on('data', (chunk) => {
        const piece = chunk.toString();
        transcript += piece;
        if (piece.endsWith(': ') || piece.endsWith(') ')) {
            setImmediate(() => input.write(`${pending.shift() ?? ''}\n`));
        }
    });
    const originalPath = process.env.PATH;
    process.env.PATH = created.env.PATH;
    try {
        await prepare(argumentList, created.directory, { input, output, isTTY: true });
        return { exitCode: 0, transcript };
    } catch (error) {
        return { exitCode: error.exitCode, transcript, message: error.message };
    } finally {
        process.env.PATH = originalPath;
    }
};

test('Enter accepts every default and the confirmation prepares the release', async () => {
    // Given
    const created = fixture({ config: FAST });

    // When
    const result = await runInteractive([], created, ['', '', '', '']);

    // Then
    assert.equal(result.exitCode, 0, result.message);
    assert.match(result.transcript, /Release version \[1\.4\.0\]: /);
    assert.match(result.transcript, /Development version \[1\.4\.1-alpha\]: /);
    assert.match(result.transcript, /Release tag \[v1\.4\.0\]: /);
    assert.match(result.transcript, /Proceed with release preparation\? \(Y\/n\) /);
    assert.equal(git(created.directory, 'tag'), 'v1.4.0');
});

test('typed versions override the defaults', async () => {
    // Given
    const created = fixture({ config: FAST });

    // When
    const result = await runInteractive([], created, ['2.0.0', '2.1.0-next', 'ui-2.0.0', 'y']);

    // Then
    assert.equal(result.exitCode, 0, result.message);
    assert.equal(git(created.directory, 'tag'), 'ui-2.0.0');
    assert.equal(git(created.directory, 'log', '-1', '--format=%s'), 'chore: prepare development 2.1.0-next');
});

test('invalid SemVer is rejected and asked again', async () => {
    // Given
    const created = fixture({ config: FAST });

    // When
    const result = await runInteractive([], created, ['1.3', '1.4.0', '1.4.1', '1.4.1-alpha', '', 'n']);

    // Then
    assert.match(result.transcript, /release version "1\.3" is not valid SemVer/);
    assert.match(result.transcript, /development version 1\.4\.1 must contain a prerelease component/);
    assert.equal(result.exitCode, 7);
});

test('declining the confirmation exits 7 and changes nothing', async () => {
    // Given
    const created = fixture({ config: FAST });
    const head = git(created.directory, 'rev-parse', 'HEAD');

    // When
    const result = await runInteractive([], created, ['', '', '', 'n']);

    // Then
    assert.equal(result.exitCode, 7);
    assert.match(result.message, /cancelled; nothing was changed/);
    assert.equal(git(created.directory, 'rev-parse', 'HEAD'), head);
    assert.equal(git(created.directory, 'tag'), '');
    assert.equal(existsSync(path.join(created.directory, '.releasemaker')), false);
});

test('bump and tag flags skip their questions', async () => {
    // Given
    const created = fixture({ config: FAST });

    // When
    const result = await runInteractive(['--minor', '-t', 'custom'], created, ['', 'n']);

    // Then
    assert.equal(result.exitCode, 7);
    assert.doesNotMatch(result.transcript, /Release version \[/);
    assert.doesNotMatch(result.transcript, /Release tag \[/);
    assert.match(result.transcript, /Development version \[1\.5\.1-alpha\]: /);
});

test('an unreachable registry asks whether to continue and stops on n', async () => {
    // Given
    const created = fixture({ config: FAST });
    created.pnpm.setRegistry({ '@company/ui@1.4.0': 'unreachable' });

    // When
    const result = await runInteractive(['--patch', '-d', '1.4.1-alpha', '-t', 'v1.4.0'], created, ['n']);

    // Then
    assert.match(result.transcript, /Continue without this check\? \(y\/N\) /);
    assert.equal(result.exitCode, 7);
});

test('a private workspace root asks which package to release', async () => {
    // Given
    const files = {
        'pnpm-workspace.yaml': 'packages:\n  - packages/*\n',
        'packages/ui/package.json': { name: '@company/ui', version: '1.4.0-alpha' },
        'packages/core/package.json': { name: '@company/core', version: '2.0.0-alpha' },
    };
    const created = fixture({ config: FAST, packageJson: { name: 'root', version: '0.0.0', private: true }, files });

    // When
    const result = await runInteractive([], created, ['2', '', '', '', '']);

    // Then
    assert.equal(result.exitCode, 0, result.message);
    assert.match(result.transcript, /1\) @company\/core 2\.0\.0-alpha/);
    assert.match(result.transcript, /2\) @company\/ui 1\.4\.0-alpha/);
    assert.equal(git(created.directory, 'tag'), 'v1.4.0');
});

test('a dry run refuses to continue past an unverifiable registry even on a TTY', async () => {
    // Given
    const created = fixture({ config: FAST });
    created.pnpm.setRegistry({ '@company/ui@1.4.0': 'unreachable' });

    // When
    const result = await runInteractive(['--dry-run'], created, []);

    // Then
    assert.equal(result.exitCode, 3);
    assert.match(result.message, /refusing to continue a dry run/);
});
