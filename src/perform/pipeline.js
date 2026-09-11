import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import semver from 'semver';
import { EXIT_CODES, failure } from '../errors.js';
import * as git from '../git.js';
import { removeReleaseState } from '../release-state.js';
import { publishTarball, versionExists } from '../registry.js';
import { quote, runCaptured, runInherited } from '../shell.js';
import { selectPackage } from '../workspace.js';
import { tagToVersion } from './release-source.js';

const performError = failure('perform', EXIT_CODES.preconditionFailure);

const checkTaggedPackage = ({ metadata, tag, tagFormat }) => {
    if (metadata.private) {
        throw performError(`package "${metadata.name}" at ${tag} is private and cannot be published`);
    }
    const version = metadata.version;
    if (semver.valid(version) !== version) {
        throw performError(`package version "${version}" at ${tag} is not valid SemVer`);
    }
    const encoded = tagToVersion(tag, tagFormat);
    if (encoded !== undefined && encoded !== version) {
        throw performError(`tag ${tag} encodes version ${encoded} but the package version at the tag is ${version}`);
    }
    if (semver.prerelease(version) !== null && encoded !== version) {
        throw performError(`package version ${version} at ${tag} is a prerelease that the tag does not encode`);
    }
};

const checkNotPublished = ({ metadata, registry, directory }) => {
    const result = versionExists({ packageName: metadata.name, version: metadata.version, registry, directory });
    if (result.state === 'exists') {
        throw performError(`${metadata.name}@${metadata.version} is already published; refusing to republish`, EXIT_CODES.registryFailure);
    }
    if (result.state === 'unverifiable') {
        throw performError(`the registry could not be queried for ${metadata.name}@${metadata.version}: ${result.reason}`, EXIT_CODES.registryFailure);
    }
};

const expectedTarballName = (metadata) => `${metadata.name.replace(/^@/, '').replace('/', '-')}-${metadata.version}.tgz`;

const pack = (packageDirectory, destination) => {
    const command = `pnpm pack --json --pack-destination ${quote(destination)}`;
    console.log(`[pack] ${command} ...`);
    const result = runCaptured(command, packageDirectory);
    if (result.status !== 0) {
        throw performError(`"${command}" failed: ${(result.stderr || result.stdout).trim()}`, EXIT_CODES.checkFailure);
    }
    let filename;
    try {
        filename = JSON.parse(result.stdout).filename;
    } catch {
        filename = undefined;
    }
    if (typeof filename !== 'string') {
        throw performError(`could not read the pnpm pack output: ${result.stdout.trim()}`, EXIT_CODES.checkFailure);
    }
    return filename;
};

/*
 * A failed publish may still have reached the registry; the registry is the
 * only source of truth, and nothing is ever republished automatically.
 */
const publish = ({ tarballPath, metadata, registry, directory }) => {
    try {
        publishTarball({ tarballPath, registry, directory });
    } catch (error) {
        const result = versionExists({ packageName: metadata.name, version: metadata.version, registry, directory });
        if (result.state === 'exists') {
            throw performError(
                `publish reported a failure but ${metadata.name}@${metadata.version} now exists; publication likely succeeded, verify the registry`,
                EXIT_CODES.ambiguousPublication,
            );
        }
        if (result.state === 'unverifiable') {
            throw performError(
                `publish failed and the registry state of ${metadata.name}@${metadata.version} is unknown; verify the registry before retrying`,
                EXIT_CODES.ambiguousPublication,
            );
        }
        throw error;
    }
};

const cleanup = (directory, worktree, temporary) => {
    try {
        if (existsSync(worktree) && git.isRepository(worktree)) {
            git.worktreeRemove(directory, worktree);
        }
    } catch (error) {
        console.error(`[perform] WARNING: the worktree ${worktree} could not be removed: ${error.message}`);
    }
    try {
        rmSync(temporary, { recursive: true, force: true });
    } catch (error) {
        console.error(`[perform] WARNING: cleanup of ${temporary} failed: ${error.message}`);
    }
};

export const performRelease = async ({ directory, config, args, tag, state }) => {
    const commit = git.resolveCommit(directory, tag);
    if (commit === undefined) {
        throw performError(`tag "${tag}" does not exist or does not resolve to a commit`);
    }
    const registry = args.registry ?? config.registry;
    const temporary = mkdtempSync(path.join(os.tmpdir(), 'releasemaker-perform-'));
    const worktree = path.join(temporary, 'source');
    const packDestination = path.join(temporary, 'pack');
    let selector = args.package ?? config.package;
    if (args.package === undefined && state?.tag === tag) {
        selector = state.package;
    }
    try {
        git.worktreeAdd(directory, worktree, tag);
        console.log(`[perform] ${tag} (${commit.slice(0, 12)}) checked out into an isolated worktree`);
        const selection = await selectPackage({ selector, directory: worktree });
        checkTaggedPackage({ metadata: selection.metadata, tag, tagFormat: config.tagFormat });
        console.log(`[perform] package ${selection.metadata.name}@${selection.metadata.version}`);
        checkNotPublished({ metadata: selection.metadata, registry, directory: selection.directory });
        runInherited('install', 'pnpm install --frozen-lockfile', worktree, EXIT_CODES.checkFailure);
        if (args.skipBuild) {
            console.log('[build] skipped (--skip-build)');
        } else {
            runInherited('build', 'pnpm build', selection.directory, EXIT_CODES.checkFailure);
        }
        mkdirSync(packDestination);
        const tarballPath = pack(selection.directory, packDestination);
        const expected = expectedTarballName(selection.metadata);
        if (path.basename(tarballPath) !== expected) {
            throw performError(`pnpm pack produced ${path.basename(tarballPath)} but ${expected} was expected`);
        }
        console.log(`[pack] ${expected}`);
        if (args.dryRun) {
            console.log('[done] dry run complete; nothing was published');
            return;
        }
        publish({ tarballPath, metadata: selection.metadata, registry, directory: selection.directory });
        if (state?.tag === tag) {
            removeReleaseState(directory);
        }
        console.log(`[done] ${selection.metadata.name}@${selection.metadata.version} published`);
    } finally {
        cleanup(directory, worktree, temporary);
    }
};
