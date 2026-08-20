#!/usr/bin/env node

import { readFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { validateEnvironment } from './lib/config.mjs';
import {
    runRemoteAdminOperator,
    validateAdminOperatorRequest,
} from './lib/admin-operator.mjs';
import { shellRunner } from './lib/runner.mjs';

function parseArguments(values) {
    const options = {};
    for (let index = 0; index < values.length; index += 2) {
        const key = values[index];
        const value = values[index + 1];
        if (!key?.startsWith('--') || value === undefined) {
            throw new Error(`Invalid argument ${key ?? 'at end of command'}.`);
        }
        options[key.slice(2)] = value;
    }
    return options;
}

export async function main(values = process.argv.slice(2)) {
    const options = parseArguments(values);
    const environment = validateEnvironment(options.environment);
    for (const required of [
        'config',
        'manifest',
        'request',
        'state-directory',
    ]) {
        if (!options[required]) throw new Error(`--${required} is required.`);
    }
    const requestPath = path.resolve(options.request);
    let request;
    try {
        request = validateAdminOperatorRequest(
            JSON.parse(await readFile(requestPath, 'utf8')),
        );
    } finally {
        await unlink(requestPath).catch(() => {});
    }
    const repositoryRoot = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '../..',
    );
    const result = await runRemoteAdminOperator({
        configPath: path.resolve(options.config),
        environment,
        manifestPath: path.resolve(options.manifest),
        repositoryRoot,
        request,
        runner: shellRunner({ cwd: repositoryRoot }),
        stateDirectory: path.resolve(options['state-directory']),
    });
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        process.stderr.write(`Remote admin command failed: ${error.message}\n`);
        process.exitCode = 1;
    });
}
