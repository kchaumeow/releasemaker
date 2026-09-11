import semver from 'semver';
import { EXIT_CODES, failure } from '../errors.js';
import * as git from '../git.js';
import { readReleaseState } from '../release-state.js';

const performError = failure('perform', EXIT_CODES.preconditionFailure);

export const tagToVersion = (tag, tagFormat) => {
    const [prefix, suffix] = tagFormat.split('${version}');
    if (!tag.startsWith(prefix) || !tag.endsWith(suffix) || tag.length <= prefix.length + suffix.length) {
        return undefined;
    }
    return tag.slice(prefix.length, tag.length - suffix.length);
};

const isReleaseTag = (tag, tagFormat) => {
    const version = tagToVersion(tag, tagFormat);
    return version !== undefined && semver.valid(version) === version;
};

export const resolveReleaseTag = ({ args, config, directory }) => {
    const state = readReleaseState(directory);
    if (args.tag !== undefined) {
        return { tag: args.tag, source: '--tag', state };
    }
    if (git.isRepository(directory)) {
        const headTags = git.tagsAtHead(directory).filter((tag) => isReleaseTag(tag, config.tagFormat));
        if (headTags.length === 1) {
            return { tag: headTags[0], source: 'HEAD', state };
        }
        if (headTags.length > 1) {
            throw performError(`HEAD carries several release tags (${headTags.join(', ')}); pass --tag`);
        }
    }
    if (state !== undefined) {
        return { tag: state.tag, source: '.releasemaker/release-state.json', state };
    }
    throw performError('No prepared release could be resolved.');
};
