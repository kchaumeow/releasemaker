import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePrepareArgs as parseCliArgs } from '../../src/cli/args.js';

test('parses long value options into camelCase keys', () => {
    // Given
    const argumentList = ['--release-version', '2.0.0', '--development-version', '2.0.1-alpha', '--tag', 'v2.0.0'];

    // When
    const args = parseCliArgs(argumentList);

    // Then
    assert.equal(args.releaseVersion, '2.0.0');
    assert.equal(args.developmentVersion, '2.0.1-alpha');
    assert.equal(args.tag, 'v2.0.0');
});

test('parses short aliases from the spec', () => {
    // Given
    const argumentList = ['-r', '2.0.0', '-d', '2.0.1-alpha', '-t', 'v2', '-p', 'packages/ui', '-y', '-h'];

    // When
    const args = parseCliArgs(argumentList);

    // Then
    assert.deepEqual(
        [args.releaseVersion, args.developmentVersion, args.tag, args.package, args.nonInteractive, args.help],
        ['2.0.0', '2.0.1-alpha', 'v2', 'packages/ui', true, true],
    );
});

test('boolean flags default to false and take no value', () => {
    // Given
    const argumentList = ['--patch'];

    // When
    const args = parseCliArgs(argumentList);

    // Then
    assert.equal(args.patch, true);
    assert.equal(args.dryRun, false);
    assert.equal(args.skipChecks, false);
    assert.equal(args.skipPack, false);
});

test('derives bump from the selected bump flag', () => {
    // Given
    const argumentList = ['--minor'];

    // When
    const args = parseCliArgs(argumentList);

    // Then
    assert.equal(args.bump, 'minor');
});

test('bump is undefined when no bump flag is given', () => {
    // Given
    const argumentList = ['-r', '2.0.0'];

    // When
    const args = parseCliArgs(argumentList);

    // Then
    assert.equal(args.bump, undefined);
});

test('rejects two bump flags with exit code 2', () => {
    // Given
    const argumentList = ['--patch', '--major'];

    // When / Then
    assert.throws(() => parseCliArgs(argumentList), { exitCode: 2, message: /mutually exclusive/ });
});

test('rejects a bump flag combined with an explicit release version', () => {
    // Given
    const argumentList = ['--minor', '--release-version', '2.0.0'];

    // When / Then
    assert.throws(() => parseCliArgs(argumentList), { exitCode: 2, message: /got --release-version, --minor/ });
});

test('allows a development version together with a bump flag', () => {
    // Given
    const argumentList = ['--patch', '-d', '1.4.1-next'];

    // When
    const args = parseCliArgs(argumentList);

    // Then
    assert.equal(args.developmentVersion, '1.4.1-next');
});

test('rejects short aliases that are not in the spec', () => {
    // Given
    const rejected = ['-P', '-m', '-M', '-n', '-s', '-k'];

    // When / Then
    for (const flag of rejected) {
        assert.throws(() => parseCliArgs([flag]), { exitCode: 2 });
    }
});

test('rejects positional arguments', () => {
    // Given
    const argumentList = ['extra'];

    // When / Then
    assert.throws(() => parseCliArgs(argumentList), { exitCode: 2 });
});

test('rejects a value option without value', () => {
    // Given
    const argumentList = ['-r'];

    // When / Then
    assert.throws(() => parseCliArgs(argumentList), { exitCode: 2 });
});

test('rejects an empty string value', () => {
    // Given
    const argumentList = ['--tag', ''];

    // When / Then
    assert.throws(() => parseCliArgs(argumentList), { exitCode: 2, message: /non-empty/ });
});

test('accepts combined short boolean flags', () => {
    // Given
    const argumentList = ['-yh'];

    // When
    const args = parseCliArgs(argumentList);

    // Then
    assert.equal(args.nonInteractive, true);
    assert.equal(args.help, true);
});
