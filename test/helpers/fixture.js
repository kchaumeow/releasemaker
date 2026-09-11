import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const CLI_PATH = fileURLToPath(new URL('../../src/cli/cli.js', import.meta.url));

export const createFixture = (filesByName = {}) => {
    const directory = mkdtempSync(path.join(os.tmpdir(), 'releasemaker-test-'));
    for (const [fileName, content] of Object.entries(filesByName)) {
        let text = content;
        if (typeof content !== 'string') {
            text = JSON.stringify(content, null, 2);
        }
        writeFileSync(path.join(directory, fileName), text);
    }
    return directory;
};

export const removeFixture = (directory) => rmSync(directory, { recursive: true, force: true });

export const runCli = (argumentList, cwd) => {
    const { status, stdout, stderr } = spawnSync(process.execPath, [CLI_PATH, ...argumentList], { cwd, encoding: 'utf8' });
    return { status, stdout, stderr };
};
