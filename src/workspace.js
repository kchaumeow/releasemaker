import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { EXIT_CODES, failure } from './errors.js';
import { readPackageJson } from './package-json.js';
import { runCaptured } from './shell.js';

const selectionError = failure('package', EXIT_CODES.preconditionFailure);

export const isWorkspace = (directory) => existsSync(path.join(directory, 'pnpm-workspace.yaml'));

export const listProjects = (directory) => {
    const result = runCaptured('pnpm ls -r --depth -1 --json', directory);
    if (result.status !== 0) {
        throw selectionError(`could not list workspace packages: ${result.stderr.trim()}`);
    }
    return JSON.parse(result.stdout).map((project) => ({ ...project, path: realpathSync(project.path) }));
};

const describe = (projects) => projects.map((project) => `${project.name} (${path.relative(process.cwd(), project.path) || '.'})`).join(', ');

const selected = async (packageDirectory) => ({ directory: packageDirectory, metadata: await readPackageJson(packageDirectory) });

const selectBySelector = async (selector, directory) => {
    const projects = listProjects(directory);
    const target = path.resolve(realpathSync(directory), selector);
    const matches = projects.filter((project) => project.name === selector || project.path === target);
    if (matches.length === 0) {
        throw selectionError(`"${selector}" matches no workspace package (known: ${describe(projects)})`);
    }
    if (matches.length > 1) {
        throw selectionError(`"${selector}" matches more than one workspace package: ${describe(matches)}`);
    }
    return selected(matches[0].path);
};

const selectFromPrivateRoot = async (directory, chooser) => {
    if (chooser === undefined) {
        throw selectionError('the workspace root is private; select a package with --package or the "package" configuration');
    }
    const root = realpathSync(directory);
    const candidates = listProjects(directory).filter((project) => !project.private && project.path !== root);
    if (candidates.length === 0) {
        throw selectionError('the workspace has no publishable package');
    }
    return selected((await chooser(candidates)).path);
};

export const selectPackage = async ({ selector, directory, chooser }) => {
    if (selector !== null && selector !== undefined) {
        return selectBySelector(selector, directory);
    }
    const root = await selected(directory);
    if (root.metadata.private && isWorkspace(directory)) {
        return selectFromPrivateRoot(directory, chooser);
    }
    return root;
};
