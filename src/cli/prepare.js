import { realpathSync } from 'node:fs';
import path from 'node:path';
import { EXIT_CODES, ReleasemakerError } from '../errors.js';
import { loadConfig } from '../config/config-loader.js';
import { checkReleasePlan, checkRepositoryState } from '../prepare/preconditions.js';
import { runChecks, verifyChecksResolvable } from '../prepare/checks.js';
import { developmentCommitMessage, executePrepare, releaseCommitMessage } from '../prepare/execute.js';
import {
    checkDevelopmentVersion,
    checkReleaseVersion,
    defaultDevelopmentVersion,
    resolveVersions,
} from '../version/version-resolver.js';
import { selectPackage } from '../workspace/workspace.js';
import { parsePrepareArgs } from './args.js';
import { PREPARE_USAGE } from './constants.js';
import { createPrompter } from './prompter.js';

const cancelledError = () => new ReleasemakerError('[prepare] cancelled; nothing was changed', EXIT_CODES.cancelled);

const formatReleaseBranch = (releaseBranch) => [].concat(releaseBranch).join(', ');

const formatRegistry = (registry) => {
    if (registry === null) {
        return '(pnpm default)';
    }
    return registry;
};

const printDryRunPlan = (plan, config, directory) => {
    console.log(`Package:              ${plan.packageName}`);
    if (plan.packageDirectory !== directory) {
        console.log(`Package directory:    ${path.relative(directory, plan.packageDirectory)}`);
    }
    console.log(`Current version:      ${plan.currentVersion}`);
    console.log(`Release version:      ${plan.releaseVersion}`);
    console.log(`Development version:  ${plan.developmentVersion}`);
    console.log(`Tag:                  ${plan.tag}`);
    console.log(`Release branch:       ${formatReleaseBranch(config.releaseBranch)}`);
    console.log(`Registry:             ${formatRegistry(config.registry)}`);
    console.log('');
    printChecks(config);
    console.log('');
    console.log('Would create commits:');
    console.log(`  ${releaseCommitMessage(plan)}`);
    console.log(`  ${developmentCommitMessage(plan)}`);
    console.log('');
    console.log('Would create tag:');
    console.log(`  ${plan.tag}`);
    console.log('');
};

const printChecks = (config) => {
    console.log('Checks:');
    for (const command of config.checks) {
        console.log(`  ${command}`);
    }
};

const printPlan = (plan) => {
    console.log(`[prepare] package ${plan.packageName}`);
    console.log(`[prepare] ${plan.currentVersion} -> ${plan.releaseVersion} -> ${plan.developmentVersion}`);
    console.log(`[prepare] tag ${plan.tag}`);
};

const formatTag = (config, releaseVersion) => config.tagFormat.replace('${version}', releaseVersion);

/*
 * Remote and registry outages are reported once; the interactive user decides,
 * every non-interactive run (including dry runs) fails closed.
 */
const unverifiablePolicy = (prompter) => async (reason) => {
    console.error(`[prepare] WARNING: ${reason}`);
    if (prompter === undefined) {
        throw new ReleasemakerError('[prepare] the remote state could not be verified; refusing to continue non-interactively', EXIT_CODES.preconditionFailure);
    }
    if (!(await prompter.confirm('Continue without this check?', false))) {
        throw cancelledError();
    }
};

const describeProject = (project) => `${project.name} ${project.version} (${project.path})`;

const askVersions = async ({ prompter, args, config, metadata, defaults }) => {
    console.log(`Current version: ${metadata.version}`);
    console.log('');
    let releaseVersion = defaults.releaseVersion;
    if (args.releaseVersion === undefined && args.bump === undefined) {
        releaseVersion = await prompter.askValidated('Release version', defaults.releaseVersion, (answer) =>
            checkReleaseVersion({ currentVersion: metadata.version, releaseVersion: answer, developmentSuffix: config.developmentSuffix }),
        );
    }
    let developmentVersion = args.developmentVersion ?? defaultDevelopmentVersion(releaseVersion, config.developmentSuffix);
    if (args.developmentVersion === undefined) {
        developmentVersion = await prompter.askValidated('Development version', developmentVersion, (answer) =>
            checkDevelopmentVersion({ releaseVersion, developmentVersion: answer }),
        );
    }
    let tag = args.tag ?? formatTag(config, releaseVersion);
    if (args.tag === undefined) {
        tag = await prompter.askText('Release tag', tag);
    }
    console.log('');
    return { releaseVersion, developmentVersion, tag };
};

const resolvePlan = async ({ prompter, args, config, selection }) => {
    const { metadata, directory: packageDirectory } = selection;
    let chosen = {
        releaseVersion: args.releaseVersion,
        developmentVersion: args.developmentVersion,
        tag: args.tag,
    };
    if (prompter !== undefined && !args.dryRun) {
        const defaults = resolveVersions({
            currentVersion: metadata.version,
            releaseVersion: args.releaseVersion,
            developmentVersion: args.developmentVersion,
            bump: args.bump,
            developmentSuffix: config.developmentSuffix,
        });
        chosen = await askVersions({ prompter, args, config, metadata, defaults });
    }
    const versions = resolveVersions({
        currentVersion: metadata.version,
        releaseVersion: chosen.releaseVersion,
        developmentVersion: chosen.developmentVersion,
        bump: args.bump,
        developmentSuffix: config.developmentSuffix,
    });
    return {
        packageName: metadata.name,
        packageDirectory,
        ...versions,
        tag: chosen.tag ?? formatTag(config, versions.releaseVersion),
    };
};

const confirmPlan = async (prompter, config) => {
    printChecks(config);
    console.log('');
    if (!(await prompter.confirm('Proceed with release preparation?', true))) {
        throw cancelledError();
    }
};

const run = async ({ args, directory, prompter }) => {
    const config = await loadConfig(directory);
    const unverifiable = unverifiablePolicy(prompter);
    const { remote } = await checkRepositoryState({ directory, config, unverifiable });

    let chooser;
    if (prompter !== undefined) {
        chooser = (projects) => prompter.choose('The workspace root is private. Select the package to release:', projects, describeProject);
    }
    const selection = await selectPackage({ selector: args.package ?? config.package, directory, chooser });
    if (selection.metadata.private) {
        throw new ReleasemakerError(
            `[prepare] package "${selection.metadata.name}" is private and cannot be published`,
            EXIT_CODES.preconditionFailure,
        );
    }

    const plan = await resolvePlan({ prompter, args, config, selection });
    if (args.dryRun) {
        printDryRunPlan(plan, config, directory);
    } else {
        printPlan(plan);
    }

    await checkReleasePlan({ directory, packageDirectory: plan.packageDirectory, plan, config, remote, unverifiable });

    if (args.dryRun) {
        verifyChecksResolvable(config, directory);
        console.log('[done] dry run complete; nothing was changed');
        return;
    }
    if (prompter !== undefined) {
        await confirmPlan(prompter, config);
    }
    runChecks(args, config, directory);
    executePrepare({ directory, packageDirectory: plan.packageDirectory, config, args, plan });
};

/*
 * pnpm reports real paths, so the working directory is resolved the same way
 * before paths are compared or made relative.
 */
export const prepare = async (argumentList, directory, io = { input: process.stdin, output: process.stdout, isTTY: process.stdin.isTTY === true }) => {
    const args = parsePrepareArgs(argumentList);
    if (args.help) {
        console.log(PREPARE_USAGE);
        return;
    }
    let prompter;
    if (io.isTTY && !args.nonInteractive) {
        prompter = createPrompter(io);
    }
    try {
        await run({ args, directory: realpathSync(directory), prompter });
    } finally {
        prompter?.close();
    }
};
