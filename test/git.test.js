import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import * as git from '../src/git.js';
import { createGitRepository, commitAll, git as gitCommand, writeFiles } from './helpers/git-fixture.js';

const roots = [];
const repository = (files, options) => {
    const created = createGitRepository(files, options);
    roots.push(created.root);
    return created;
};
after(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

test('isRepository is true inside a repository and false outside', () => {
    // Given
    const { root, directory } = repository();

    // When / Then
    assert.equal(git.isRepository(directory), true);
    assert.equal(git.isRepository(root), false);
});

test('currentBranch returns the branch name and undefined when detached', () => {
    // Given
    const { directory } = repository();

    // When
    const onBranch = git.currentBranch(directory);
    gitCommand(directory, 'checkout', '--quiet', '--detach');
    const detached = git.currentBranch(directory);

    // Then
    assert.equal(onBranch, 'main');
    assert.equal(detached, undefined);
});

test('changedPaths lists modified and untracked files', () => {
    // Given
    const { directory } = repository({ 'a.txt': 'a' });
    writeFileSync(path.join(directory, 'a.txt'), 'changed');
    writeFileSync(path.join(directory, 'new.txt'), 'new');

    // When
    const paths = git.changedPaths(directory);

    // Then
    assert.deepEqual(paths.sort(), ['a.txt', 'new.txt']);
});

test('changedPaths ignores files matched by .gitignore', () => {
    // Given
    const { directory } = repository();
    writeFiles(directory, { '.releasemaker/release-state.json': '{}' });

    // When / Then
    assert.deepEqual(git.changedPaths(directory), []);
});

test('operationInProgress reports a conflicted merge', () => {
    // Given
    const { directory } = repository({ 'a.txt': 'base' });
    gitCommand(directory, 'checkout', '--quiet', '-b', 'other');
    writeFileSync(path.join(directory, 'a.txt'), 'other');
    commitAll(directory, 'other');
    gitCommand(directory, 'checkout', '--quiet', 'main');
    writeFileSync(path.join(directory, 'a.txt'), 'main');
    commitAll(directory, 'main');
    spawnSync('git', ['merge', 'other'], { cwd: directory });

    // When / Then
    assert.equal(git.operationInProgress(directory), 'MERGE_HEAD');
});

test('operationInProgress is undefined on a clean repository', () => {
    // Given
    const { directory } = repository();

    // When / Then
    assert.equal(git.operationInProgress(directory), undefined);
});

test('upstream returns the tracking branch and undefined without one', () => {
    // Given
    const tracked = repository();
    const local = repository({}, { withRemote: false });

    // When / Then
    assert.equal(git.upstream(tracked.directory), 'origin/main');
    assert.equal(git.upstream(local.directory), undefined);
});

test('remoteBranchCommit returns the remote commit when in sync', () => {
    // Given
    const { directory } = repository();

    // When
    const result = git.remoteBranchCommit(directory, 'origin', 'main');

    // Then
    assert.equal(result.reachable, true);
    assert.equal(result.commit, git.headCommit(directory));
});

test('remoteBranchCommit reports an unreachable remote', () => {
    // Given
    const { directory } = repository();
    gitCommand(directory, 'remote', 'set-url', 'origin', '/nonexistent/path/origin.git');

    // When
    const result = git.remoteBranchCommit(directory, 'origin', 'main');

    // Then
    assert.equal(result.reachable, false);
    assert.match(result.reason, /nonexistent/);
});

test('remoteTagExists distinguishes present and absent tags', () => {
    // Given
    const { directory } = repository();
    gitCommand(directory, 'tag', 'v1.0.0');
    gitCommand(directory, 'push', '--quiet', 'origin', 'v1.0.0');

    // When / Then
    assert.deepEqual(git.remoteTagExists(directory, 'origin', 'v1.0.0').exists, true);
    assert.deepEqual(git.remoteTagExists(directory, 'origin', 'v2.0.0').exists, false);
});

test('isAncestor detects an ahead-only branch', () => {
    // Given
    const { directory } = repository();
    const remoteCommit = git.headCommit(directory);
    writeFileSync(path.join(directory, 'b.txt'), 'b');
    commitAll(directory, 'ahead');

    // When / Then
    assert.equal(git.isAncestor(directory, remoteCommit, 'HEAD'), true);
    assert.equal(git.isAncestor(directory, 'HEAD', remoteCommit), false);
});

test('tagExists, tagsAtHead and resolveCommit work on annotated tags', () => {
    // Given
    const { directory } = repository();

    // When
    git.createAnnotatedTag(directory, 'v1.0.0', 'release: 1.0.0');

    // Then
    assert.equal(git.tagExists(directory, 'v1.0.0'), true);
    assert.equal(git.tagExists(directory, 'v9.9.9'), false);
    assert.deepEqual(git.tagsAtHead(directory), ['v1.0.0']);
    assert.equal(git.resolveCommit(directory, 'v1.0.0'), git.headCommit(directory));
    assert.equal(git.resolveCommit(directory, 'v9.9.9'), undefined);
    assert.equal(gitCommand(directory, 'cat-file', '-t', 'v1.0.0'), 'tag');
});

test('commit adds the given paths and returns the new head', () => {
    // Given
    const { directory } = repository({ 'a.txt': 'a' });
    const start = git.headCommit(directory);
    writeFileSync(path.join(directory, 'a.txt'), 'changed');

    // When
    git.addPaths(directory, ['a.txt']);
    const created = git.commit(directory, 'release: 1.0.0');

    // Then
    assert.notEqual(created, start);
    assert.equal(gitCommand(directory, 'log', '-1', '--format=%s'), 'release: 1.0.0');
    assert.deepEqual(git.changedPaths(directory), []);
});

test('restorePaths reverts tracked changes and resetHard moves HEAD back', () => {
    // Given
    const { directory } = repository({ 'a.txt': 'a' });
    const start = git.headCommit(directory);
    writeFileSync(path.join(directory, 'a.txt'), 'changed');

    // When
    git.restorePaths(directory, ['a.txt']);
    writeFileSync(path.join(directory, 'a.txt'), 'again');
    commitAll(directory, 'extra');
    git.resetHard(directory, start);

    // Then
    assert.equal(git.headCommit(directory), start);
    assert.deepEqual(git.changedPaths(directory), []);
});

test('deleteTag removes a local tag', () => {
    // Given
    const { directory } = repository();
    git.createAnnotatedTag(directory, 'v1.0.0', 'release: 1.0.0');

    // When
    git.deleteTag(directory, 'v1.0.0');

    // Then
    assert.equal(git.tagExists(directory, 'v1.0.0'), false);
});

test('worktreeAdd checks out the tag in a detached worktree and showFile reads tagged content', () => {
    // Given
    const { root, directory } = repository({ 'package.json': { name: 'a', version: '1.0.0' } });
    git.createAnnotatedTag(directory, 'v1.0.0', 'release: 1.0.0');
    writeFileSync(path.join(directory, 'package.json'), '{"name":"a","version":"1.0.1-alpha"}');
    commitAll(directory, 'dev');
    const worktreePath = path.join(root, 'worktree');

    // When
    git.worktreeAdd(directory, worktreePath, 'v1.0.0');
    const tagged = JSON.parse(git.showFile(directory, 'v1.0.0', 'package.json'));
    const checkedOut = JSON.parse(gitCommand(worktreePath, 'show', 'HEAD:package.json'));
    git.worktreeRemove(directory, worktreePath);

    // Then
    assert.equal(tagged.version, '1.0.0');
    assert.equal(checkedOut.version, '1.0.0');
    assert.equal(git.currentBranch(directory), 'main');
    assert.equal(git.showFile(directory, 'v1.0.0', 'missing.json'), undefined);
});

test('isIgnored honours .gitignore', () => {
    // Given
    const { directory } = repository();

    // When / Then
    assert.equal(git.isIgnored(directory, '.releasemaker/release-state.json'), true);
    assert.equal(git.isIgnored(directory, 'package.json'), false);
});

test('git failures throw exit code 5', () => {
    // Given
    const { directory } = repository();

    // When / Then
    assert.throws(() => git.deleteTag(directory, 'missing'), { exitCode: 5, message: /\[git\] "git tag --delete missing" failed/ });
});

test('changedPaths reports paths with spaces and non-ASCII characters unquoted', () => {
    // Given
    const { directory } = repository();
    writeFiles(directory, { 'caf\u00e9 note.txt': 'x' });

    // When
    const paths = git.changedPaths(directory);

    // Then
    assert.deepEqual(paths, ['caf\u00e9 note.txt']);
});

test('changedPaths reports the new path of a rename once', () => {
    // Given
    const { directory } = repository({ 'old name.txt': 'x' });
    gitCommand(directory, 'mv', 'old name.txt', 'new name.txt');

    // When
    const paths = git.changedPaths(directory);

    // Then
    assert.deepEqual(paths, ['new name.txt']);
});
