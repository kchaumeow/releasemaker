import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runCli } from '../helpers/fixture.js';

test('no command prints usage to stderr and exits 2', () => {
    // Given / When
    const result = runCli([]);

    // Then
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Usage: releasemaker/);
});

test('--help prints usage and exits 0', () => {
    // Given / When
    const result = runCli(['--help']);

    // Then
    assert.equal(result.status, 0);
    assert.match(result.stdout, /--release-version/);
});

test('-h prints usage and exits 0', () => {
    // Given / When
    const result = runCli(['-h']);

    // Then
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Usage: releasemaker/);
});

test('unknown command exits 2', () => {
    // Given / When
    const result = runCli(['bogus']);

    // Then
    assert.equal(result.status, 2);
    assert.match(result.stderr, /unknown command "bogus"/);
});

test('perform fails because no prepared release exists', () => {
    // Given / When
    const result = runCli(['perform']);

    // Then
    assert.equal(result.status, 3);
    assert.equal(result.stderr.trim(), '[perform] No prepared release could be resolved.');
});

test('prepare --help prints usage and exits 0', () => {
    // Given / When
    const result = runCli(['prepare', '--help']);

    // Then
    assert.equal(result.status, 0);
    assert.match(result.stdout, /Usage: releasemaker/);
});
