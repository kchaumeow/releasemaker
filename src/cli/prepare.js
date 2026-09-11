import { spawnSync } from 'node:child_process';
import { EXIT_CODES, ReleasemakerError } from '../errors.js';
import { loadConfig } from '../config/config-loader.js';
import { readPackageJson } from '../metadata/package-json-reader.js';
import { resolveVersions } from '../version/version-resolver.js';
import { parseCliArgs } from './args.js';
import { USAGE } from './constants.js';

const PACK_COMMAND = 'pnpm pack --dry-run';

const releaseCommitMessage = (plan) => `release: ${plan.releaseVersion}`;

const developmentCommitMessage = (plan) => `chore: prepare development ${plan.developmentVersion}`;

const formatReleaseBranch = (releaseBranch) => {
    if (Array.isArray(releaseBranch)) {
        return releaseBranch.join(', ');
    }
    return releaseBranch;
};

const formatRegistry = (registry) => {
    if (registry === null) {
        return '(pnpm default)';
    }
    return registry;
};

const printDryRunPlan = (plan, config) => {
    console.log(`Package:              ${plan.packageName}`);
    console.log(`Current version:      ${plan.currentVersion}`);
    console.log(`Release version:      ${plan.releaseVersion}`);
    console.log(`Development version:  ${plan.developmentVersion}`);
    console.log(`Tag:                  ${plan.tag}`);
    console.log(`Release branch:       ${formatReleaseBranch(config.releaseBranch)}`);
    console.log(`Registry:             ${formatRegistry(config.registry)}`);
    console.log('');
    console.log('Checks:');
    for (const command of config.checks) {
        console.log(`  ${command}`);
    }
    console.log('');
    console.log('Would create commits:');
    console.log(`  ${releaseCommitMessage(plan)}`);
    console.log(`  ${developmentCommitMessage(plan)}`);
    console.log('');
    console.log('Would create tag:');
    console.log(`  ${plan.tag}`);
};

const printPlan = (plan) => {
    console.log(`[prepare] package ${plan.packageName}`);
    console.log(`[prepare] ${plan.currentVersion} -> ${plan.releaseVersion} -> ${plan.developmentVersion}`);
    console.log(`[prepare] tag ${plan.tag}`);
};

/*
 * Checks are user-authored shell strings, so they run through the shell.
 * On Windows this also resolves pnpm.cmd without a platform switch.
 */
const runShellCommand = (phase, command, directory) => {
    console.log(`[${phase}] ${command} ...`);
    const { error, status, signal } = spawnSync(command, { cwd: directory, shell: true, stdio: 'inherit' });
    if (error) {
        throw new ReleasemakerError(`[${phase}] could not start "${command}": ${error.message}`, EXIT_CODES.checkFailure);
    }
    if (status === null) {
        throw new ReleasemakerError(`[${phase}] "${command}" was terminated by signal ${signal}`, EXIT_CODES.checkFailure);
    }
    if (status !== 0) {
        throw new ReleasemakerError(`[${phase}] "${command}" failed with exit code ${status}`, EXIT_CODES.checkFailure);
    }
    console.log(`[${phase}] ${command} ... ok`);
};

const runChecks = (args, config, directory) => {
    if (args.skipChecks) {
        console.error('[prepare] WARNING: --skip-checks given; the configured checks were NOT run:');
        for (const command of config.checks) {
            console.error(`  ${command}`);
        }
        return;
    }
    if (args.dryRun) {
        console.log('[check] not executed (dry run)');
        return;
    }
    for (const command of config.checks) {
        runShellCommand('check', command, directory);
    }
};

const runPackValidation = (args, config, directory) => {
    if (!config.pack) {
        console.log('[pack] skipped (config pack: false)');
        return;
    }
    if (args.skipPack) {
        console.log('[pack] skipped (--skip-pack)');
        return;
    }
    if (args.dryRun) {
        console.log(`[pack] ${PACK_COMMAND} (not executed)`);
        return;
    }
    runShellCommand('pack', PACK_COMMAND, directory);
};

export const prepare = async (argumentList, directory) => {
    const args = parseCliArgs(argumentList);
    if (args.help) {
        console.log(USAGE);
        return;
    }

    const config = await loadConfig(directory);

    const packageSelector = args.package ?? config.package;
    if (packageSelector !== null && packageSelector !== undefined) {
        throw new ReleasemakerError(
            `[prepare] workspace package selection is not supported yet (got "${packageSelector}")`,
            EXIT_CODES.invalidUsage,
        );
    }

    const metadata = await readPackageJson(directory);
    if (metadata.private) {
        throw new ReleasemakerError(
            `[prepare] package "${metadata.name}" is private and cannot be published`,
            EXIT_CODES.preconditionFailure,
        );
    }

    const versions = resolveVersions({
        currentVersion: metadata.version,
        releaseVersion: args.releaseVersion,
        developmentVersion: args.developmentVersion,
        bump: args.bump,
        developmentSuffix: config.developmentSuffix,
    });

    const plan = {
        packageName: metadata.name,
        ...versions,
        tag: args.tag ?? config.tagFormat.replace('${version}', versions.releaseVersion),
    };

    if (args.dryRun) {
        printDryRunPlan(plan, config);
        console.log('');
    } else {
        printPlan(plan);
    }

    runChecks(args, config, directory);
    runPackValidation(args, config, directory);

    if (args.dryRun) {
        console.log('[done] dry run complete; nothing was changed');
        return;
    }
    console.log('[prepare] stopping before Git mutations: commit, tag and development version are not implemented yet');
};
