import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { EXIT_CODES, ReleasemakerError } from '../errors.js';
import * as git from '../git/git.js';
import { runInherited } from '../shell.js';
import { writeReleaseState } from './release-state.js';

const PACK_COMMAND = 'pnpm pack --dry-run';
const LOCKFILE_COMMAND = 'pnpm install --lockfile-only --prefer-offline';
const LOCKFILE = 'pnpm-lock.yaml';

export const releaseCommitMessage = (plan) => `release: ${plan.releaseVersion}`;

export const developmentCommitMessage = (plan) => `chore: prepare development ${plan.developmentVersion}`;

const preconditionError = (message) => new ReleasemakerError(`[prepare] ${message}`, EXIT_CODES.preconditionFailure);

const detectIndent = (text) => {
    const match = text.match(/^([ \t]+)"/m);
    if (match === null) {
        return 2;
    }
    return match[1];
};

export const writeVersion = (packageJsonPath, version) => {
    const text = readFileSync(packageJsonPath, 'utf8');
    const packageJson = JSON.parse(text);
    packageJson.version = version;
    let trailing = '';
    if (text.endsWith('\n')) {
        trailing = '\n';
    }
    writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, detectIndent(text)) + trailing);
};

/*
 * pnpm-lock.yaml does not record the importer's own version, so any lockfile
 * change here means dependency resolution moved, which the spec treats as failure.
 */
const updateLockfile = (directory, expectedPath) => {
    if (!existsSync(path.join(directory, LOCKFILE))) {
        return;
    }
    runInherited('lockfile', LOCKFILE_COMMAND, directory, EXIT_CODES.checkFailure);
    const unexpected = git.changedPaths(directory).filter((changedPath) => changedPath !== expectedPath);
    if (unexpected.length > 0) {
        throw preconditionError(
            `the version update changed more than package.json, so dependency resolution changed:\n  ${unexpected.join('\n  ')}\n${git.diffStat(directory, unexpected)}`,
        );
    }
};

const runPackValidation = (args, config, packageDirectory) => {
    if (!config.pack) {
        console.log('[pack] skipped (config pack: false)');
        return;
    }
    if (args.skipPack) {
        console.log('[pack] skipped (--skip-pack)');
        return;
    }
    runInherited('pack', PACK_COMMAND, packageDirectory, EXIT_CODES.checkFailure);
};

const commitVersion = ({ directory, packageJsonRelativePath, version }) => {
    writeVersion(path.join(directory, packageJsonRelativePath), version);
    updateLockfile(directory, packageJsonRelativePath);
    git.addPaths(directory, git.changedPaths(directory));
};

const printRecovery = (directory, transaction, plan) => {
    console.error('[prepare] automatic rollback was not safe; repository state:');
    console.error(`  starting commit: ${transaction.startCommit}`);
    console.error(`  current HEAD:    ${git.headCommit(directory)}`);
    console.error('[prepare] manual recovery:');
    console.error(`  git reset --hard ${transaction.startCommit}`);
    if (transaction.tagCreated) {
        console.error(`  git tag --delete ${plan.tag}`);
    }
};

const rollback = (directory, transaction, plan, touchedPaths) => {
    try {
        const head = git.headCommit(directory);
        if (transaction.releaseCommit === undefined && head === transaction.startCommit) {
            git.restorePaths(directory, touchedPaths.filter((touched) => existsSync(path.join(directory, touched))));
            console.error('[prepare] rolled back file changes');
            return;
        }
        const ownCommits = [transaction.releaseCommit, transaction.developmentCommit];
        if (ownCommits.includes(head)) {
            git.resetHard(directory, transaction.startCommit);
            if (transaction.tagCreated) {
                git.deleteTag(directory, plan.tag);
            }
            console.error(`[prepare] rolled back to ${transaction.startCommit}`);
            return;
        }
    } catch (error) {
        console.error(`[prepare] rollback failed: ${error.message}`);
    }
    printRecovery(directory, transaction, plan);
};

/*
 * The Git history is complete once the development commit exists; a failure
 * writing the local convenience file must not undo a prepared release.
 */
const recordReleaseState = (directory, plan, transaction) => {
    try {
        writeReleaseState(directory, {
            package: plan.packageName,
            releaseVersion: plan.releaseVersion,
            developmentVersion: plan.developmentVersion,
            tag: plan.tag,
            releaseCommit: transaction.releaseCommit,
            developmentCommit: transaction.developmentCommit,
        });
    } catch (error) {
        console.error(`[prepare] WARNING: could not write .releasemaker/release-state.json: ${error.message}`);
        console.error(`[prepare] the release is prepared; run "releasemaker perform --tag ${plan.tag}" to publish it`);
    }
};

export const executePrepare = ({ directory, packageDirectory, config, args, plan }) => {
    const packageJsonRelativePath = path.relative(directory, path.join(packageDirectory, 'package.json'));
    const transaction = { startCommit: git.headCommit(directory), releaseCommit: undefined, developmentCommit: undefined, tagCreated: false };
    const releaseMessage = releaseCommitMessage(plan);
    const developmentMessage = developmentCommitMessage(plan);
    try {
        commitVersion({ directory, packageJsonRelativePath, version: plan.releaseVersion });
        runPackValidation(args, config, packageDirectory);
        transaction.releaseCommit = git.commit(directory, releaseMessage);
        console.log(`[git] commit ${releaseMessage}`);
        git.createAnnotatedTag(directory, plan.tag, releaseMessage);
        transaction.tagCreated = true;
        console.log(`[git] tag ${plan.tag}`);
        commitVersion({ directory, packageJsonRelativePath, version: plan.developmentVersion });
        transaction.developmentCommit = git.commit(directory, developmentMessage);
        console.log(`[git] commit ${developmentMessage}`);
        recordReleaseState(directory, plan, transaction);
        console.log(`[done] release ${plan.tag} prepared`);
    } catch (error) {
        rollback(directory, transaction, plan, [packageJsonRelativePath, LOCKFILE]);
        throw error;
    }
};
