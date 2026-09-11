export const EXIT_CODES = {
    generalFailure: 1,
    invalidUsage: 2,
    preconditionFailure: 3,
    checkFailure: 4,
};

export class ReleasemakerError extends Error {
    constructor(message, exitCode) {
        super(message);
        this.exitCode = exitCode;
    }
}
