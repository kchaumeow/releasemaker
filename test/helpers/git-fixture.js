import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const git = (directory, ...argumentList) => {
    const result = spawnSync('git', argumentList, { cwd: directory, encoding: 'utf8' });
    if (result.status !== 0) {
        throw new Error(`git ${argumentList.join(' ')} failed: ${result.stderr}`);
    }
    return result.stdout.trim();
};

export const writeFiles = (directory, filesByName) => {
    for (const [fileName, content] of Object.entries(filesByName)) {
        let text = content;
        if (typeof content !== 'string') {
            text = JSON.stringify(content, null, 2) + '\n';
        }
        const filePath = path.join(directory, fileName);
        mkdirSync(path.dirname(filePath), { recursive: true });
        writeFileSync(filePath, text);
    }
};

export const commitAll = (directory, message) => {
    git(directory, 'add', '--all');
    git(directory, 'commit', '--quiet', '--message', message);
    return git(directory, 'rev-parse', 'HEAD');
};

/*
 * A bare "origin" next to the working repository lets the remote checks run
 * against a real remote without network; tests break the URL to simulate outages.
 */
export const createGitRepository = (filesByName = {}, { withRemote = true, branch = 'main' } = {}) => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'releasemaker-git-'));
    const directory = path.join(root, 'repo');
    mkdirSync(directory);
    git(directory, 'init', '--quiet', '--initial-branch', branch);
    git(directory, 'config', 'user.name', 'Test');
    git(directory, 'config', 'user.email', 'test@example.com');
    git(directory, 'config', 'commit.gpgsign', 'false');
    git(directory, 'config', 'tag.gpgsign', 'false');
    writeFiles(directory, { '.gitignore': 'node_modules/\n.releasemaker/\n', ...filesByName });
    commitAll(directory, 'initial');
    let remote;
    if (withRemote) {
        remote = path.join(root, 'origin.git');
        git(root, 'init', '--quiet', '--bare', remote);
        git(directory, 'remote', 'add', 'origin', remote);
        git(directory, 'push', '--quiet', '--set-upstream', 'origin', branch);
    }
    return { root, directory, remote };
};
