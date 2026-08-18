#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
    assertDeployConfig,
    readDeployConfig,
    validateEnvironment,
} from './lib/config.mjs';
import { Deployment } from './lib/deployment.mjs';
import { readReleaseManifest } from './lib/manifest.mjs';
import { shellRunner } from './lib/runner.mjs';

function parseArguments(values) {
    const [command, ...rest] = values;
    if (!['deploy', 'verify', 'rollback'].includes(command)) {
        throw new Error(
            'Usage: cli.mjs <deploy|verify|rollback> --environment <stage|production> --manifest <path> [--config <path>] [--state-directory <path>] [--runtime-directory <path>]',
        );
    }
    const options = { command };
    for (let index = 0; index < rest.length; index += 2) {
        const key = rest[index];
        const value = rest[index + 1];
        if (!key?.startsWith('--') || value === undefined)
            throw new Error(`Invalid argument ${key}.`);
        options[key.slice(2)] = value;
    }
    return options;
}

export async function main(values = process.argv.slice(2)) {
    const options = parseArguments(values);
    const environment = validateEnvironment(options.environment);
    if (!options.manifest) throw new Error('--manifest is required.');
    const allowLocalRegistry = options['allow-local-registry'] === 'true';
    if (allowLocalRegistry && process.env.LANGUON_LOCAL_REHEARSAL !== 'true') {
        throw new Error(
            'Local registry manifests are permitted only by the guarded rehearsal.',
        );
    }
    const manifest = await readReleaseManifest(path.resolve(options.manifest), {
        allowLocalRegistry,
    });
    const configPath = path.resolve(
        options.config || `/etc/languon/${environment}.env`,
    );
    const config = assertDeployConfig(
        environment,
        await readDeployConfig(configPath),
    );
    const repositoryRoot = path.resolve(
        path.dirname(fileURLToPath(import.meta.url)),
        '../..',
    );
    const deployment = new Deployment({
        environment,
        config,
        configPath,
        manifest,
        repositoryRoot,
        runtimeDirectory: path.resolve(
            options['runtime-directory'] ||
                `/opt/languon/runtime/${environment}`,
        ),
        stateDirectory: path.resolve(
            options['state-directory'] || `/var/lib/languon/${environment}`,
        ),
        runner: shellRunner({ cwd: repositoryRoot }),
        drainSeconds: options['drain-seconds']
            ? Number(options['drain-seconds'])
            : 300,
    });
    const result = await deployment[options.command]();
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch((error) => {
        process.stderr.write(`Deployment failed: ${error.message}\n`);
        process.exitCode = 1;
    });
}
