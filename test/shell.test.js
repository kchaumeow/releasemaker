import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quote, runCaptured, runInherited } from '../src/shell.js';

test('runInherited returns when the command succeeds', () => {
    // Given
    const command = 'node -e 0';

    // When / Then
    assert.doesNotThrow(() => runInherited('check', command, process.cwd(), 4));
});

test('runInherited throws the given exit code when the command fails', () => {
    // Given
    const command = 'node -e "process.exit(3)"';

    // When / Then
    assert.throws(() => runInherited('check', command, process.cwd(), 6), {
        exitCode: 6,
        message: /\[check\] "node -e "process\.exit\(3\)"" failed with exit code 3/,
    });
});

test('runCaptured returns stdout and status', () => {
    // Given
    const command = 'node -e "console.log(\'hello\')"';

    // When
    const result = runCaptured(command, process.cwd());

    // Then
    assert.equal(result.status, 0);
    assert.equal(result.stdout.trim(), 'hello');
});

test('runCaptured reports a non-zero status with stderr', () => {
    // Given
    const command = 'node -e "console.error(\'bad\'); process.exit(2)"';

    // When
    const result = runCaptured(command, process.cwd());

    // Then
    assert.equal(result.status, 2);
    assert.equal(result.stderr.trim(), 'bad');
});

test('quote keeps a path with spaces as one shell argument', () => {
    // Given
    const command = `node -e "console.log(process.argv[1])" ${quote('/tmp/a b/c')}`;

    // When
    const result = runCaptured(command, process.cwd());

    // Then
    assert.equal(result.stdout.trim(), '/tmp/a b/c');
});
