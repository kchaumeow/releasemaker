import { existsSync, readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { EXIT_CODES, failure } from '../errors.js';
import * as git from '../git.js';
import { versionExists } from '../registry.js';

const preconditionError = failure('prepare', EXIT_CODES.preconditionFailure);

const lockfileDisabled = (directory) => {
    const npmrcPath = path.join(directory, '.npmrc');
    if (!existsSync(npmrcPath)) {
        return false;
    }
    return /^\s*lockfile\s*=\s*false\s*$/m.test(readFileSync(npmrcPath, 'utf8'));
};

const fallbackRemote = (directory) => {
    if (git.remotes(directory).includes('origin')) {
        return 'origin';
    }
    return undefined;
};

/*
 * "Ahead only" is allowed because the developer may prepare commits before
 * pushing; anything else (behind, diverged) must be resolved by the user.
 */
const checkUpstream = async ({ directory, branch, unverifiable }) => {
    const tracking = git.upstream(directory);
    if (tracking === undefined) {
        await unverifiable(`branch "${branch}" has no upstream, so the remote state cannot be verified`);
        return fallbackRemote(directory);
    }
    const separator = tracking.indexOf('/');
    const remote = tracking.slice(0, separator);
    const remoteBranch = tracking.slice(separator + 1);
    const result = git.remoteBranchCommit(directory, remote, remoteBranch);
    if (!result.reachable) {
        await unverifiable(`remote "${remote}" is not reachable: ${result.reason}`);
        return remote;
    }
    if (result.commit === undefined || result.commit === git.headCommit(directory)) {
        return remote;
    }
    if (!git.hasObject(directory, result.commit) || !git.isAncestor(directory, result.commit, 'HEAD')) {
        throw preconditionError(`branch "${branch}" is behind or has diverged from ${tracking}; pull first`);
    }
    return remote;
};

export const checkRepositoryState = async ({ directory, config, unverifiable }) => {
    if (!git.isRepository(directory)) {
        throw preconditionError(`${directory} is not inside a Git repository`);
    }
    if (realpathSync(git.topLevel(directory)) !== directory) {
        throw preconditionError(`prepare must run in the repository root (${git.topLevel(directory)})`);
    }
    const changed = git.changedPaths(directory);
    if (changed.length > 0) {
        throw preconditionError(`the working tree has uncommitted changes:\n  ${changed.join('\n  ')}`);
    }
    const allowed = [].concat(config.releaseBranch);
    const branch = git.currentBranch(directory);
    if (branch === undefined) {
        throw preconditionError(`HEAD is detached; prepare must run on a release branch (${allowed.join(', ')})`);
    }
    if (!allowed.includes(branch)) {
        throw preconditionError(`branch "${branch}" is not a release branch (allowed: ${allowed.join(', ')})`);
    }
    const operation = git.operationInProgress(directory);
    if (operation !== undefined) {
        throw preconditionError(`a Git operation is in progress (${operation}); finish or abort it first`);
    }
    if (!existsSync(path.join(directory, 'pnpm-lock.yaml')) && !lockfileDisabled(directory)) {
        throw preconditionError('pnpm-lock.yaml is missing; run "pnpm install" and commit it, or set lockfile=false in .npmrc');
    }
    const remote = await checkUpstream({ directory, branch, unverifiable });
    return { branch, remote };
};

export const checkReleasePlan = async ({ directory, packageDirectory, plan, config, remote, unverifiable }) => {
    if (git.tagExists(directory, plan.tag)) {
        throw preconditionError(`tag "${plan.tag}" already exists`);
    }
    if (remote !== undefined) {
        const result = git.remoteTagExists(directory, remote, plan.tag);
        if (!result.reachable) {
            await unverifiable(`remote "${remote}" is not reachable, so tag "${plan.tag}" could not be checked: ${result.reason}`);
        } else if (result.exists) {
            throw preconditionError(`tag "${plan.tag}" already exists on remote "${remote}"`);
        }
    }
    const registry = versionExists({
        packageName: plan.packageName,
        version: plan.releaseVersion,
        registry: config.registry,
        directory: packageDirectory,
    });
    if (registry.state === 'exists') {
        throw preconditionError(`version ${plan.releaseVersion} of ${plan.packageName} is already published`);
    }
    if (registry.state === 'unverifiable') {
        await unverifiable(`the registry could not be queried for ${plan.packageName}@${plan.releaseVersion}: ${registry.reason}`);
    }
};
