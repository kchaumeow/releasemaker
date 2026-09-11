import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tagToVersion } from '../../src/perform/release-source.js';

test('tagToVersion extracts the version from the default format', () => {
    // Given / When / Then
    assert.equal(tagToVersion('v1.4.0', 'v${version}'), '1.4.0');
});

test('tagToVersion handles prefixes and suffixes', () => {
    // Given / When / Then
    assert.equal(tagToVersion('ui-v2.0.0-rc.1-release', 'ui-v${version}-release'), '2.0.0-rc.1');
});

test('tagToVersion is undefined when the tag does not follow the format', () => {
    // Given / When / Then
    assert.equal(tagToVersion('release-1.4.0', 'v${version}'), undefined);
    assert.equal(tagToVersion('v', 'v${version}'), undefined);
});
