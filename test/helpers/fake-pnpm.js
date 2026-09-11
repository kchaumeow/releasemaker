import { chmodSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const REAL_PNPM = spawnSync('which', ['pnpm'], { encoding: 'utf8' }).stdout.trim();

/*
 * The script is CommonJS and lives outside any package.json scope, so Node
 * runs it regardless of the fixture's module type. Behavior is driven by JSON
 * control files next to it; every invocation is appended to calls.log.
 */
const SCRIPT = `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const control = __CONTROL__;
const realPnpm = __REAL__;
const args = process.argv.slice(2);
fs.appendFileSync(path.join(control, 'calls.log'), args.join(' ') + '\\n');
const readJson = (name, fallback) => {
    const file = path.join(control, name);
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
};
const failures = readJson('failures.json', {});
const fail = (key) => {
    if (failures[key] !== undefined) {
        console.error('fake pnpm: ' + key + ' failed');
        process.exit(failures[key]);
    }
};
const command = args[0];
if (command === 'ls') {
    const result = spawnSync(realPnpm, args, { stdio: 'inherit' });
    process.exit(result.status ?? 1);
}
if (command === 'view') {
    const registry = readJson('registry.json', {});
    const state = registry[args[1]] ?? 'absent';
    if (state === 'exists') {
        console.log(JSON.stringify(args[1].split('@').pop()));
        process.exit(0);
    }
    const codes = { absent: 'ERR_PNPM_PACKAGE_NOT_FOUND', missingPackage: 'ERR_PNPM_FETCH_404', unreachable: 'ERR_PNPM_META_FETCH_FAIL', unauthorized: 'ERR_PNPM_FETCH_401' };
    console.log(JSON.stringify({ error: { code: codes[state], message: state } }));
    process.exit(1);
}
if (command === 'pack') {
    fail('pack');
    const manifest = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
    const filename = manifest.name.replace(/^@/, '').replace('/', '-') + '-' + manifest.version + '.tgz';
    const destinationIndex = args.indexOf('--pack-destination');
    let destination = process.cwd();
    if (destinationIndex !== -1) destination = args[destinationIndex + 1];
    const tarball = path.join(destination, filename);
    if (!args.includes('--dry-run')) fs.writeFileSync(tarball, 'tarball');
    if (args.includes('--json')) console.log(JSON.stringify({ name: manifest.name, version: manifest.version, filename: tarball }));
    else console.log(filename);
    process.exit(0);
}
if (command === 'publish') {
    const publish = readJson('publish.json', { exit: 0 });
    if (publish.registryAfter) {
        const registry = readJson('registry.json', {});
        fs.writeFileSync(path.join(control, 'registry.json'), JSON.stringify({ ...registry, ...publish.registryAfter }));
    }
    if (publish.exit !== 0) console.error('fake pnpm: publish failed');
    process.exit(publish.exit);
}
if (command === 'install') {
    fail('install');
    if (args.includes('--lockfile-only')) {
        const installs = fs.readFileSync(path.join(control, 'calls.log'), 'utf8').split('\\n').filter((line) => line.startsWith('install --lockfile-only')).length;
        if (failures.lockfileChange || (failures.lockfileChangeOnSecondInstall && installs === 2)) {
            fs.appendFileSync(path.join(process.cwd(), 'pnpm-lock.yaml'), '# changed by fake pnpm\\n');
        }
    }
    process.exit(0);
}
fail(command);
process.exit(0);
`;

export const createFakePnpm = () => {
    const controlDirectory = mkdtempSync(path.join(os.tmpdir(), 'releasemaker-fake-pnpm-'));
    const binDirectory = path.join(controlDirectory, 'bin');
    mkdirSync(binDirectory);
    const scriptPath = path.join(binDirectory, 'pnpm');
    writeFileSync(scriptPath, SCRIPT.replace('__CONTROL__', JSON.stringify(controlDirectory)).replace('__REAL__', JSON.stringify(REAL_PNPM)));
    chmodSync(scriptPath, 0o755);
    const write = (name, content) => writeFileSync(path.join(controlDirectory, name), JSON.stringify(content));
    return {
        controlDirectory,
        env: { ...process.env, PATH: `${binDirectory}${path.delimiter}${process.env.PATH}` },
        setRegistry: (registry) => write('registry.json', registry),
        setPublish: (publish) => write('publish.json', publish),
        setFailures: (failures) => write('failures.json', failures),
        calls: () => {
            const logPath = path.join(controlDirectory, 'calls.log');
            if (!existsSync(logPath)) {
                return [];
            }
            return readFileSync(logPath, 'utf8').split('\n').filter((line) => line !== '');
        },
    };
};
