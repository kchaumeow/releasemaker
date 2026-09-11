import semver from 'semver';
import { EXIT_CODES, ReleasemakerError } from '../errors.js';

const isStrictSemVer = (value) => semver.valid(value) === value;

const hasPrerelease = (version) => semver.prerelease(version) !== null;

const stableCore = (version) => {
    const parsed = semver.parse(version);
    return `${parsed.major}.${parsed.minor}.${parsed.patch}`;
};

/*
 * semver.inc on a prerelease treats the pending bump as already applied
 * (1.4.0-alpha minor -> 1.4.0), while the spec wants 1.5.0. Bumping the
 * stable core instead gives the spec's result for every case.
 */
export const releaseVersionForBump = (currentVersion, bump) => {
    const core = stableCore(currentVersion);
    if (bump === 'patch' && hasPrerelease(currentVersion)) {
        return core;
    }
    return semver.inc(core, bump);
};

export const defaultDevelopmentVersion = (releaseVersion, developmentSuffix) =>
    `${semver.inc(releaseVersion, 'patch')}-${developmentSuffix}`;

export const checkVersions = ({ currentVersion, releaseVersion, developmentVersion, developmentSuffix }) => {
    if (!isStrictSemVer(releaseVersion)) {
        return `release version "${releaseVersion}" is not valid SemVer`;
    }
    if (!isStrictSemVer(developmentVersion)) {
        return `development version "${developmentVersion}" is not valid SemVer`;
    }
    if (semver.prerelease(releaseVersion)?.[0] === developmentSuffix) {
        return `release version ${releaseVersion} must not use the development suffix "${developmentSuffix}"`;
    }
    if (!semver.gt(releaseVersion, currentVersion)) {
        return `release version ${releaseVersion} must be greater than current version ${currentVersion}`;
    }
    if (!hasPrerelease(developmentVersion)) {
        return `development version ${developmentVersion} must contain a prerelease component`;
    }
    if (!semver.gt(developmentVersion, releaseVersion)) {
        return `development version ${developmentVersion} must be greater than release version ${releaseVersion}`;
    }
    return undefined;
};

const preconditionError = (message) => new ReleasemakerError(`[prepare] ${message}`, EXIT_CODES.preconditionFailure);

export const resolveVersions = ({ currentVersion, releaseVersion, developmentVersion, bump, developmentSuffix }) => {
    if (!isStrictSemVer(currentVersion)) {
        throw preconditionError(`current version "${currentVersion}" in package.json is not valid SemVer`);
    }
    const resolvedRelease = releaseVersion ?? releaseVersionForBump(currentVersion, bump ?? 'patch');
    const resolvedDevelopment = developmentVersion ?? defaultDevelopmentVersion(resolvedRelease, developmentSuffix);
    const error = checkVersions({
        currentVersion,
        releaseVersion: resolvedRelease,
        developmentVersion: resolvedDevelopment,
        developmentSuffix,
    });
    if (error) {
        throw preconditionError(error);
    }
    return { currentVersion, releaseVersion: resolvedRelease, developmentVersion: resolvedDevelopment };
};
