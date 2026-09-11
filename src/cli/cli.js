#!/usr/bin/env node
/** @file Entry point of the releasemaker CLI. Prints usage and dispatches `prepare` and `perform`. */
import { readPackageJson } from '../metadata/package-json-reader.js';

const startText = `
  Welcome to the Releasemaker CLI!
  This tool helps you prepare and perform releases for your projects.
  Available commands:
    - prepare: Prepare the release by gathering necessary information.
    - perform: Perform the release based on the prepared information.
  Flags:
    --release-version, -r: Release the package
    --development-version, -d: Override development version
    --tag, -t: Override git tag
    --package, -p: Select workspace package
    --patch, -P: Override patch version
    --minor, -m: Override minor version
    --major, -M: Override major version
    --dry-run, -n: Dry run mode
    --skip-checks, -s: Skip checks
    --skip-pack, -k: Skip pnpm pack validation
`;
console.log(startText);

switch (process.argv[2]) {
    case 'prepare': {
        const { prepare } = await import('./prepare.js');
        const metadata = await readPackageJson();
        prepare(process.argv.slice(3), metadata);
        break;
    }
    case 'perform':
        // const { main } = await import('./perform.js');
        break;
    default:
        console.log('Invalid command. Use "prepare" or "perform".');
        process.exit(1);
}
