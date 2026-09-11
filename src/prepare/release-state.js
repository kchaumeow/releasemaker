import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as git from '../git/git.js';

const STATE_RELATIVE_PATH = path.join('.releasemaker', 'release-state.json');

const STATE_KEYS = ['package', 'releaseVersion', 'developmentVersion', 'tag', 'releaseCommit', 'developmentCommit'];

export const releaseStatePath = (directory) => path.join(directory, STATE_RELATIVE_PATH);

export const writeReleaseState = (directory, state) => {
    const filePath = releaseStatePath(directory);
    mkdirSync(path.dirname(filePath), { recursive: true });
    writeFileSync(filePath, JSON.stringify(state, null, 2) + '\n');
    if (!git.isIgnored(directory, STATE_RELATIVE_PATH)) {
        console.error('[prepare] WARNING: .releasemaker/ is not ignored by Git; add ".releasemaker/" to .gitignore');
    }
};

export const readReleaseState = (directory) => {
    const filePath = releaseStatePath(directory);
    if (!existsSync(filePath)) {
        return undefined;
    }
    let state;
    try {
        state = JSON.parse(readFileSync(filePath, 'utf8'));
    } catch {
        return undefined;
    }
    if (state === null || typeof state !== 'object' || STATE_KEYS.some((key) => typeof state[key] !== 'string')) {
        return undefined;
    }
    return state;
};

export const removeReleaseState = (directory) => {
    rmSync(releaseStatePath(directory), { force: true });
};
