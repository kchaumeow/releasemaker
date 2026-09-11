import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { readPackageJson } from '../src/package-json.js';
import { createFixture, removeFixture } from './helpers/fixture.js';

const fixtures = [];
const fixture = (files) => {
    const directory = createFixture(files);
    fixtures.push(directory);
    return directory;
};
after(() => fixtures.forEach(removeFixture));

test('reads name and version', async () => {
    // Given
    const directory = fixture({ 'package.json': { name: '@company/ui', version: '1.4.0-alpha' } });

    // When
    const metadata = await readPackageJson(directory);

    // Then
    assert.equal(metadata.name, '@company/ui');
    assert.equal(metadata.version, '1.4.0-alpha');
});

test('private defaults to false', async () => {
    // Given
    const directory = fixture({ 'package.json': { name: 'a', version: '1.0.0' } });

    // When
    const metadata = await readPackageJson(directory);

    // Then
    assert.equal(metadata.private, false);
});

test('private true is surfaced', async () => {
    // Given
    const directory = fixture({ 'package.json': { name: 'a', version: '1.0.0', private: true } });

    // When
    const metadata = await readPackageJson(directory);

    // Then
    assert.equal(metadata.private, true);
});

test('fails with exit code 3 when version is missing', async () => {
    // Given
    const directory = fixture({ 'package.json': { name: 'a' } });

    // When / Then
    await assert.rejects(readPackageJson(directory), { exitCode: 3, message: /package.json.version must be a non-empty string/ });
});

test('fails with exit code 3 when package.json is missing', async () => {
    // Given
    const directory = fixture({});

    // When / Then
    await assert.rejects(readPackageJson(directory), { exitCode: 3, message: /no package.json in/ });
});

test('fails with exit code 3 when private is not a boolean', async () => {
    // Given
    const directory = fixture({ 'package.json': { name: 'a', version: '1.0.0', private: 'yes' } });

    // When / Then
    await assert.rejects(readPackageJson(directory), { exitCode: 3, message: /private must be a boolean/ });
});
