import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkConfig } from '../../src/config/checker.js';

test('accepts an empty config', () => {
    // Given
    const config = {};

    // When
    const error = checkConfig(config);

    // Then
    assert.equal(error, undefined);
});

test('rejects a non-object config', () => {
    // Given
    const config = ['pnpm test'];

    // When
    const error = checkConfig(config);

    // Then
    assert.equal(error, 'Config must be an object');
});

test('rejects an unknown key and lists the allowed keys', () => {
    // Given
    const config = { branch: 'main' };

    // When
    const error = checkConfig(config);

    // Then
    assert.match(error, /unknown key "branch"; allowed keys: developmentSuffix, tagFormat, releaseBranch/);
});

test('rejects a developmentSuffix that is not a prerelease identifier', () => {
    // Given
    const config = { developmentSuffix: 'alpha beta' };

    // When
    const error = checkConfig(config);

    // Then
    assert.match(error, /developmentSuffix must be a valid SemVer prerelease identifier/);
});

test('rejects a tagFormat without the version placeholder', () => {
    // Given
    const config = { tagFormat: 'release' };

    // When
    const error = checkConfig(config);

    // Then
    assert.match(error, /tagFormat must be a string containing \$\{version\} exactly once/);
});

test('rejects a tagFormat with two version placeholders', () => {
    // Given
    const config = { tagFormat: '${version}-${version}' };

    // When
    const error = checkConfig(config);

    // Then
    assert.match(error, /tagFormat/);
});

test('accepts releaseBranch as an array of strings', () => {
    // Given
    const config = { releaseBranch: ['main', 'release'] };

    // When
    const error = checkConfig(config);

    // Then
    assert.equal(error, undefined);
});

test('rejects releaseBranch as an empty array', () => {
    // Given
    const config = { releaseBranch: [] };

    // When
    const error = checkConfig(config);

    // Then
    assert.match(error, /releaseBranch/);
});

test('accepts registry as null', () => {
    // Given
    const config = { registry: null };

    // When
    const error = checkConfig(config);

    // Then
    assert.equal(error, undefined);
});

test('rejects registry as a number', () => {
    // Given
    const config = { registry: 42 };

    // When
    const error = checkConfig(config);

    // Then
    assert.equal(error, 'Config.registry must be a string or null');
});

test('rejects checks containing a non-string', () => {
    // Given
    const config = { checks: ['pnpm test', 7] };

    // When
    const error = checkConfig(config);

    // Then
    assert.equal(error, 'Config.checks must be an array of non-empty strings');
});

test('rejects pack as a string', () => {
    // Given
    const config = { pack: 'yes' };

    // When
    const error = checkConfig(config);

    // Then
    assert.equal(error, 'Config.pack must be a boolean');
});

test('accepts package as a string', () => {
    // Given
    const config = { package: '@company/ui' };

    // When
    const error = checkConfig(config);

    // Then
    assert.equal(error, undefined);
});
