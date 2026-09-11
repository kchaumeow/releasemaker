import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveVersions } from '../../src/version/version-resolver.js';

const resolve = (currentVersion, overrides = {}) =>
    resolveVersions({ currentVersion, developmentSuffix: 'alpha', ...overrides });

const bumpCases = [
    ['1.4.0-alpha', 'patch', '1.4.0'],
    ['1.4.0-alpha', 'minor', '1.5.0'],
    ['1.4.0-alpha', 'major', '2.0.0'],
    ['1.4.0', 'patch', '1.4.1'],
    ['1.4.0', 'minor', '1.5.0'],
    ['1.4.0', 'major', '2.0.0'],
    ['1.4.3-alpha', 'patch', '1.4.3'],
    ['1.4.3-alpha', 'minor', '1.5.0'],
    ['1.4.3-alpha', 'major', '2.0.0'],
    ['0.8.2-alpha', 'major', '1.0.0'],
    ['1.5.0-alpha', 'minor', '1.6.0'],
];

for (const [current, bump, expected] of bumpCases) {
    test(`--${bump} from ${current} releases ${expected}`, () => {
        // Given / When
        const versions = resolve(current, { bump });

        // Then
        assert.equal(versions.releaseVersion, expected);
    });
}

const defaultCases = [
    ['1.4.0-alpha', '1.4.0', '1.4.1-alpha'],
    ['1.4.0-alpha.7', '1.4.0', '1.4.1-alpha'],
    ['1.4.0-alpha.12', '1.4.0', '1.4.1-alpha'],
    ['2.0.0-beta', '2.0.0', '2.0.1-alpha'],
    ['1.4.0', '1.4.1', '1.4.2-alpha'],
    ['2.0.0', '2.0.1', '2.0.2-alpha'],
];

for (const [current, release, development] of defaultCases) {
    test(`defaults from ${current} are ${release} and ${development}`, () => {
        // Given / When
        const versions = resolve(current);

        // Then
        assert.equal(versions.releaseVersion, release);
        assert.equal(versions.developmentVersion, development);
    });
}

test('development version follows the resolved release, not the bump kind', () => {
    // Given / When
    const versions = resolve('1.4.3-alpha', { bump: 'minor' });

    // Then
    assert.equal(versions.developmentVersion, '1.5.1-alpha');
});

test('uses the configured development suffix', () => {
    // Given / When
    const versions = resolve('1.4.0-next', { developmentSuffix: 'next' });

    // Then
    assert.equal(versions.developmentVersion, '1.4.1-next');
});

test('explicit release version is used as is', () => {
    // Given / When
    const versions = resolve('1.4.0-alpha', { releaseVersion: '2.3.0' });

    // Then
    assert.equal(versions.releaseVersion, '2.3.0');
    assert.equal(versions.developmentVersion, '2.3.1-alpha');
});

test('explicit development version with another prerelease suffix is valid', () => {
    // Given / When
    const versions = resolve('1.4.0-alpha', { developmentVersion: '1.4.1-next' });

    // Then
    assert.equal(versions.developmentVersion, '1.4.1-next');
});

test('rejects a release version lower than the current version', () => {
    // Given / When / Then
    assert.throws(() => resolve('1.4.0-alpha', { releaseVersion: '1.3.0' }), {
        exitCode: 3,
        message: /release version 1.3.0 must be greater than current version 1.4.0-alpha/,
    });
});

test('rejects a release version ending in the development suffix', () => {
    // Given / When / Then
    assert.throws(() => resolve('1.4.0-alpha', { releaseVersion: '1.4.0-alpha.2' }), {
        exitCode: 3,
        message: /must not use the development suffix "alpha"/,
    });
});

test('rejects a stable development version', () => {
    // Given / When / Then
    assert.throws(() => resolve('1.4.0-alpha', { developmentVersion: '1.4.1' }), {
        exitCode: 3,
        message: /development version 1.4.1 must contain a prerelease component/,
    });
});

test('rejects a development version not greater than the release version', () => {
    // Given / When / Then
    assert.throws(() => resolve('1.4.0-alpha', { developmentVersion: '1.4.0-beta' }), {
        exitCode: 3,
        message: /development version 1.4.0-beta must be greater than release version 1.4.0/,
    });
});

test('rejects an invalid explicit release version', () => {
    // Given / When / Then
    assert.throws(() => resolve('1.4.0-alpha', { releaseVersion: 'notaversion' }), {
        exitCode: 3,
        message: /release version "notaversion" is not valid SemVer/,
    });
});

test('rejects an invalid explicit development version', () => {
    // Given / When / Then
    assert.throws(() => resolve('1.4.0-alpha', { developmentVersion: '1.4.1-' }), {
        exitCode: 3,
        message: /development version "1.4.1-" is not valid SemVer/,
    });
});

test('rejects a current version with a leading v', () => {
    // Given / When / Then
    assert.throws(() => resolve('v1.4.0'), {
        exitCode: 3,
        message: /current version "v1.4.0" in package.json is not valid SemVer/,
    });
});

test('rejects a current version with two components', () => {
    // Given / When / Then
    assert.throws(() => resolve('1.4'), { exitCode: 3 });
});
