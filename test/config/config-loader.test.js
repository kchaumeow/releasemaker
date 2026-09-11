import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { loadConfig } from '../../src/config/config-loader.js';
import { DEFAULT_CONFIG } from '../../src/config/default-config.js';
import { createFixture, removeFixture } from '../helpers/fixture.js';

const fixtures = [];
const fixture = (files) => {
    const directory = createFixture(files);
    fixtures.push(directory);
    return directory;
};
after(() => fixtures.forEach(removeFixture));

test('returns the defaults when no config file exists', async () => {
    // Given
    const directory = fixture({});

    // When
    const config = await loadConfig(directory);

    // Then
    assert.deepEqual(config, DEFAULT_CONFIG);
});

test('merges releasemaker.json over the defaults', async () => {
    // Given
    const directory = fixture({ 'releasemaker.json': { tagFormat: 'ui-v${version}' } });

    // When
    const config = await loadConfig(directory);

    // Then
    assert.equal(config.tagFormat, 'ui-v${version}');
    assert.deepEqual(config.checks, DEFAULT_CONFIG.checks);
});

test('reads .releasemakerrc when it is the only config file', async () => {
    // Given
    const directory = fixture({ '.releasemakerrc': { pack: false } });

    // When
    const config = await loadConfig(directory);

    // Then
    assert.equal(config.pack, false);
});

test('fails with exit code 2 when both config files exist', async () => {
    // Given
    const directory = fixture({ 'releasemaker.json': {}, '.releasemakerrc': {} });

    // When / Then
    await assert.rejects(loadConfig(directory), { exitCode: 2, message: /both releasemaker.json and .releasemakerrc exist/ });
});

test('fails with exit code 2 on invalid JSON', async () => {
    // Given
    const directory = fixture({ 'releasemaker.json': '{ not json' });

    // When / Then
    await assert.rejects(loadConfig(directory), { exitCode: 2, message: /releasemaker.json is not valid JSON/ });
});

test('fails with exit code 2 on a checker error', async () => {
    // Given
    const directory = fixture({ 'releasemaker.json': { check: ['pnpm test'] } });

    // When / Then
    await assert.rejects(loadConfig(directory), { exitCode: 2, message: /unknown key "check"/ });
});
