export const EXIT_CODES = {
    generalFailure: 1,
    invalidUsage: 2,
    preconditionFailure: 3,
    checkFailure: 4,
    gitFailure: 5,
    registryFailure: 6,
    cancelled: 7,
    ambiguousPublication: 8,
};

export class ReleasemakerError extends Error {
    constructor(message, exitCode) {
        super(message);
        this.exitCode = exitCode;
    }
}

export const failure = (prefix, defaultExitCode) => (message, exitCode = defaultExitCode) =>
    new ReleasemakerError(`[${prefix}] ${message}`, exitCode);
