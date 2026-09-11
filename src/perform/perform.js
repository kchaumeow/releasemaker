import { realpathSync } from 'node:fs';
import { loadConfig } from '../config/loader.js';
import { performRelease } from './pipeline.js';
import { resolveReleaseTag } from './release-source.js';
import { parsePerformArgs } from '../cli/args.js';
import { PERFORM_USAGE } from '../cli/usage.js';

export const perform = async (argumentList, directory) => {
    const args = parsePerformArgs(argumentList);
    if (args.help) {
        console.log(PERFORM_USAGE);
        return;
    }
    const repository = realpathSync(directory);
    const config = await loadConfig(repository);
    const { tag, source, state } = resolveReleaseTag({ args, config, directory: repository });
    console.log(`[perform] release tag ${tag} (from ${source})`);
    await performRelease({ directory: repository, config, args, tag, state });
};
