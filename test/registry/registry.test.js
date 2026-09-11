import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { registryOption, versionExists } from '../../src/registry/registry.js';
import { createFakePnpm } from '../helpers/fake-pnpm.js';

const fakes = [];
const fakePnpm = () => {
    const fake = createFakePnpm();
    fakes.push(fake);
    return fake;
};
after(() => fakes.forEach((fake) => rmSync(fake.controlDirectory, { recursive: true, force: true })));

const withPath = (fake, callback) => {
    const originalPath = process.env.PATH;
    process.env.PATH = fake.env.PATH;
    try {
        return callback();
    } finally {
        process.env.PATH = originalPath;
    }
};

test('registryOption is empty for null and a flag for a URL', () => {
    // Given / When / Then
    assert.equal(registryOption(null), '');
    assert.equal(registryOption('https://r.example.com/'), ' --registry "https://r.example.com/"');
});

test('versionExists reports an existing version', () => {
    // Given
    const fake = fakePnpm();
    fake.setRegistry({ 'a@1.0.0': 'exists' });

    // When
    const result = withPath(fake, () => versionExists({ packageName: 'a', version: '1.0.0', registry: null, directory: process.cwd() }));

    // Then
    assert.equal(result.state, 'exists');
});

test('versionExists treats a missing version and a missing package as absent', () => {
    // Given
    const fake = fakePnpm();
    fake.setRegistry({ 'a@1.0.0': 'absent', 'b@1.0.0': 'missingPackage' });

    // When
    const a = withPath(fake, () => versionExists({ packageName: 'a', version: '1.0.0', registry: null, directory: process.cwd() }));
    const b = withPath(fake, () => versionExists({ packageName: 'b', version: '1.0.0', registry: null, directory: process.cwd() }));

    // Then
    assert.equal(a.state, 'absent');
    assert.equal(b.state, 'absent');
});

test('versionExists reports other errors as unverifiable with the pnpm code', () => {
    // Given
    const fake = fakePnpm();
    fake.setRegistry({ 'a@1.0.0': 'unauthorized' });

    // When
    const result = withPath(fake, () => versionExists({ packageName: 'a', version: '1.0.0', registry: null, directory: process.cwd() }));

    // Then
    assert.equal(result.state, 'unverifiable');
    assert.match(result.reason, /ERR_PNPM_FETCH_401/);
});
