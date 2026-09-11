import { realpathSync } from 'node:fs';
import { loadConfig } from '../config/config-loader.js';
import { performRelease } from '../perform/pipeline.js';
import { resolveReleaseTag } from '../perform/release-source.js';
import { parsePerformArgs } from './args.js';
import { PERFORM_USAGE } from './constants.js';

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
