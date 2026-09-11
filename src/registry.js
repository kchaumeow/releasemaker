import { quote, runCaptured, runInherited } from './shell.js';
import { EXIT_CODES } from './errors.js';

const ABSENT_CODES = ['ERR_PNPM_PACKAGE_NOT_FOUND', 'ERR_PNPM_FETCH_404'];

export const registryOption = (registry) => {
    if (registry === null || registry === undefined) {
        return '';
    }
    return ` --registry ${quote(registry)}`;
};

const parseError = (stdout) => {
    try {
        return JSON.parse(stdout).error ?? {};
    } catch {
        return {};
    }
};

export const versionExists = ({ packageName, version, registry, directory }) => {
    const command = `pnpm view ${quote(`${packageName}@${version}`)} version --json${registryOption(registry)}`;
    const result = runCaptured(command, directory);
    if (result.status === 0) {
        return { state: 'exists' };
    }
    const error = parseError(result.stdout);
    if (ABSENT_CODES.includes(error.code)) {
        return { state: 'absent' };
    }
    const reason = error.message ?? (result.stderr || result.stdout).trim();
    return { state: 'unverifiable', reason: `${error.code ?? 'pnpm view failed'}: ${reason}` };
};

export const publishTarball = ({ tarballPath, registry, directory }) => {
    runInherited('publish', `pnpm publish ${quote(tarballPath)} --no-git-checks${registryOption(registry)}`, directory, EXIT_CODES.registryFailure);
};
