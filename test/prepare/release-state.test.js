import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { readReleaseState, releaseStatePath, removeReleaseState, writeReleaseState } from '../../src/prepare/release-state.js';
import { createGitRepository } from '../helpers/git-fixture.js';

const roots = [];
const repository = () => {
    const created = createGitRepository({}, { withRemote: false });
    roots.push(created.root);
    return created.directory;
};
after(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

const STATE = {
    package: '@company/ui',
    releaseVersion: '1.4.0',
    developmentVersion: '1.4.1-alpha',
    tag: 'v1.4.0',
    releaseCommit: 'a'.repeat(40),
    developmentCommit: 'b'.repeat(40),
};

test('writeReleaseState then readReleaseState round-trips', () => {
    // Given
    const directory = repository();

    // When
    writeReleaseState(directory, STATE);

    // Then
    assert.deepEqual(readReleaseState(directory), STATE);
    assert.equal(releaseStatePath(directory), path.join(directory, '.releasemaker', 'release-state.json'));
});

test('readReleaseState is undefined when the file is missing, invalid JSON or incomplete', () => {
    // Given
    const missing = repository();
    const invalid = repository();
    writeReleaseState(invalid, STATE);
    writeFileSync(releaseStatePath(invalid), '{not json');
    const incomplete = repository();
    writeReleaseState(incomplete, { tag: 'v1.0.0' });

    // When / Then
    assert.equal(readReleaseState(missing), undefined);
    assert.equal(readReleaseState(invalid), undefined);
    assert.equal(readReleaseState(incomplete), undefined);
});

test('removeReleaseState deletes the file and tolerates a missing one', () => {
    // Given
    const directory = repository();
    writeReleaseState(directory, STATE);

    // When
    removeReleaseState(directory);
    removeReleaseState(directory);

    // Then
    assert.equal(existsSync(releaseStatePath(directory)), false);
});
