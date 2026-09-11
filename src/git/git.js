import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { EXIT_CODES, ReleasemakerError } from '../errors.js';

const gitError = (message) => new ReleasemakerError(`[git] ${message}`, EXIT_CODES.gitFailure);

const run = (directory, argumentList) => {
    const { error, status, stdout, stderr } = spawnSync('git', argumentList, { cwd: directory, encoding: 'utf8' });
    if (error) {
        throw gitError(`could not start git: ${error.message}`);
    }
    return { status, stdout, stderr };
};

const runOrThrow = (directory, argumentList) => {
    const result = run(directory, argumentList);
    if (result.status !== 0) {
        throw gitError(`"git ${argumentList.join(' ')}" failed: ${result.stderr.trim()}`);
    }
    return result.stdout;
};

const lines = (text) => text.split('\n').filter((line) => line !== '');

export const isRepository = (directory) => {
    const result = run(directory, ['rev-parse', '--is-inside-work-tree']);
    return result.status === 0 && result.stdout.trim() === 'true';
};

export const topLevel = (directory) => runOrThrow(directory, ['rev-parse', '--show-toplevel']).trim();

export const headCommit = (directory) => runOrThrow(directory, ['rev-parse', '--verify', 'HEAD^{commit}']).trim();

export const currentBranch = (directory) => {
    const name = runOrThrow(directory, ['rev-parse', '--abbrev-ref', 'HEAD']).trim();
    if (name === 'HEAD') {
        return undefined;
    }
    return name;
};

const OPERATION_MARKERS = ['MERGE_HEAD', 'rebase-merge', 'rebase-apply', 'CHERRY_PICK_HEAD', 'REVERT_HEAD'];

export const operationInProgress = (directory) => {
    for (const marker of OPERATION_MARKERS) {
        const markerPath = runOrThrow(directory, ['rev-parse', '--git-path', marker]).trim();
        if (existsSync(path.resolve(directory, markerPath))) {
            return marker;
        }
    }
    return undefined;
};

/*
 * Porcelain v1 prints "XY path" and, for renames, "XY old -> new"; only the
 * final path is relevant for reporting and for the whitelist checks.
 */
export const changedPaths = (directory) => {
    const output = runOrThrow(directory, ['status', '--porcelain=v1', '--untracked-files=all']);
    return lines(output).map((line) => line.slice(3).split(' -> ').pop());
};

export const upstream = (directory) => {
    const result = run(directory, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']);
    if (result.status !== 0) {
        return undefined;
    }
    return result.stdout.trim();
};

export const remotes = (directory) => lines(runOrThrow(directory, ['remote']));

const lsRemote = (directory, remote, reference) => {
    const result = run(directory, ['ls-remote', '--exit-code', remote, reference]);
    if (result.status === 0) {
        return { reachable: true, commit: result.stdout.split(/\s/)[0] };
    }
    if (result.status === 2) {
        return { reachable: true, commit: undefined };
    }
    return { reachable: false, reason: result.stderr.trim() };
};

export const remoteBranchCommit = (directory, remote, branch) => lsRemote(directory, remote, `refs/heads/${branch}`);

export const remoteTagExists = (directory, remote, tag) => {
    const result = lsRemote(directory, remote, `refs/tags/${tag}`);
    return { reachable: result.reachable, exists: result.commit !== undefined, reason: result.reason };
};

export const isAncestor = (directory, ancestor, descendant) =>
    run(directory, ['merge-base', '--is-ancestor', ancestor, descendant]).status === 0;

export const hasObject = (directory, sha) => run(directory, ['cat-file', '-e', `${sha}^{commit}`]).status === 0;

export const tagExists = (directory, tag) => run(directory, ['show-ref', '--verify', '--quiet', `refs/tags/${tag}`]).status === 0;

export const tagsAtHead = (directory) => lines(runOrThrow(directory, ['tag', '--points-at', 'HEAD']));

export const resolveCommit = (directory, reference) => {
    const result = run(directory, ['rev-parse', '--verify', '--quiet', `${reference}^{commit}`]);
    if (result.status !== 0) {
        return undefined;
    }
    return result.stdout.trim();
};

export const isIgnored = (directory, filePath) => run(directory, ['check-ignore', '-q', filePath]).status === 0;

export const addPaths = (directory, paths) => {
    runOrThrow(directory, ['add', '--', ...paths]);
};

export const commit = (directory, message) => {
    runOrThrow(directory, ['commit', '--quiet', '--message', message]);
    return headCommit(directory);
};

export const createAnnotatedTag = (directory, tag, message) => {
    runOrThrow(directory, ['tag', '--annotate', '--message', message, tag]);
};

export const deleteTag = (directory, tag) => {
    runOrThrow(directory, ['tag', '--delete', tag]);
};

export const restorePaths = (directory, paths) => {
    runOrThrow(directory, ['restore', '--source=HEAD', '--staged', '--worktree', '--', ...paths]);
};

export const resetHard = (directory, sha) => {
    runOrThrow(directory, ['reset', '--hard', '--quiet', sha]);
};

export const worktreeAdd = (directory, worktreePath, reference) => {
    runOrThrow(directory, ['worktree', 'add', '--detach', worktreePath, reference]);
};

export const worktreeRemove = (directory, worktreePath) => {
    runOrThrow(directory, ['worktree', 'remove', '--force', worktreePath]);
};

export const showFile = (directory, reference, filePath) => {
    const result = run(directory, ['show', `${reference}:${filePath}`]);
    if (result.status !== 0) {
        return undefined;
    }
    return result.stdout;
};

export const diffStat = (directory, paths) => runOrThrow(directory, ['diff', '--stat', 'HEAD', '--', ...paths]).trim();
