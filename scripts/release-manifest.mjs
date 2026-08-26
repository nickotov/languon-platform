#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import process from 'node:process';
import {
    DIGEST_IMAGE_PATTERN,
    IMAGE_NAMES,
    SEMVER_PATTERN,
    SHA_PATTERN,
    validateReleaseManifest,
} from '../infra/deploy/lib/manifest.mjs';

function fail(message) {
    throw new Error(message);
}

function parseOptions(values) {
    const options = new Map();

    for (let index = 0; index < values.length; index += 1) {
        const flag = values[index];
        if (!flag.startsWith('--')) {
            fail(`Unexpected argument: ${flag}`);
        }

        const value = values[index + 1];
        if (value === undefined || value.startsWith('--')) {
            fail(`Missing value for ${flag}`);
        }

        const name = flag.slice(2);
        const existing = options.get(name);
        options.set(
            name,
            existing
                ? Array.isArray(existing)
                    ? [...existing, value]
                    : [existing, value]
                : value,
        );
        index += 1;
    }

    return options;
}

function required(options, name) {
    const value = options.get(name);
    if (typeof value !== 'string' || value.length === 0) {
        fail(`--${name} is required`);
    }
    return value;
}

function commaSeparated(options, name) {
    const value = options.get(name);
    if (value === undefined || value === '') return [];
    if (typeof value !== 'string') fail(`--${name} may be provided once`);
    return value.split(',').filter(Boolean);
}

function requiredInteger(options, name) {
    const value = required(options, name);
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) {
        fail(`--${name} must be a non-negative safe integer`);
    }
    return Number(value);
}

function createManifest(options) {
    const sourceSha = required(options, 'source-sha');
    const identity = required(options, 'identity');
    const workflowRunText = required(options, 'workflow-run');
    const versionText = options.get('version');
    const imageValues = options.get('image');
    const images = {};

    for (const item of Array.isArray(imageValues)
        ? imageValues
        : imageValues
          ? [imageValues]
          : []) {
        const separator = item.indexOf('=');
        if (separator < 1) fail(`Invalid --image value: ${item}`);
        images[item.slice(0, separator)] = item.slice(separator + 1);
    }

    return validateReleaseManifest({
        schemaVersion: 2,
        identity,
        version: versionText || null,
        sourceSha,
        verified: true,
        workflowRun: Number(workflowRunText),
        createdAt: new Date().toISOString(),
        migration: {
            compatibility: required(options, 'migration-compatibility'),
            ledger: required(options, 'migration-ledger'),
        },
        dictionaryJobs: {
            phase: required(options, 'dictionary-job-phase'),
            workerProcessable: commaSeparated(
                options,
                'dictionary-job-worker-processable',
            ),
            apiReadable: commaSeparated(options, 'dictionary-job-api-readable'),
            apiCancellable: commaSeparated(
                options,
                'dictionary-job-api-cancellable',
            ),
            apiDiscardable: commaSeparated(
                options,
                'dictionary-job-api-discardable',
            ),
            apiAcceptable: commaSeparated(
                options,
                'dictionary-job-api-acceptable',
            ),
            apiEnqueued: commaSeparated(options, 'dictionary-job-api-enqueued'),
            webReadable: commaSeparated(options, 'dictionary-job-web-readable'),
            retireFormats: commaSeparated(
                options,
                'dictionary-job-retire-formats',
            ),
            generationBudget: {
                maxInputTokensPerAttempt: requiredInteger(
                    options,
                    'dictionary-job-max-input-tokens-per-attempt',
                ),
                maxOutputTokensPerAttempt: requiredInteger(
                    options,
                    'dictionary-job-max-output-tokens-per-attempt',
                ),
                inputCostMicrosPerMillionTokens: requiredInteger(
                    options,
                    'dictionary-job-input-cost-micros-per-million-tokens',
                ),
                outputCostMicrosPerMillionTokens: requiredInteger(
                    options,
                    'dictionary-job-output-cost-micros-per-million-tokens',
                ),
                maxCostMicrosPerAttempt: requiredInteger(
                    options,
                    'dictionary-job-max-cost-micros-per-attempt',
                ),
            },
        },
        images,
    });
}

async function main() {
    const [command, ...values] = process.argv.slice(2);
    const options = parseOptions(values);

    if (command === 'create') {
        const output = required(options, 'output');
        const manifest = createManifest(options);
        await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`, {
            flag: 'wx',
        });
        return;
    }

    if (command === 'validate') {
        const input = required(options, 'input');
        const manifest = JSON.parse(await readFile(input, 'utf8'));
        validateReleaseManifest(manifest, {
            imagePrefix: options.get('expected-image-prefix'),
            sourceSha: options.get('expected-source-sha'),
            version: options.get('expected-version'),
        });
        process.stdout.write(`${JSON.stringify(manifest)}\n`);
        return;
    }

    fail('Usage: release-manifest.mjs <create|validate> [options]');
}

if (
    process.argv[1] &&
    import.meta.url === new URL(`file://${process.argv[1]}`).href
) {
    main().catch((error) => {
        process.stderr.write(`${error.message}\n`);
        process.exitCode = 1;
    });
}

export {
    DIGEST_IMAGE_PATTERN,
    IMAGE_NAMES,
    SEMVER_PATTERN,
    SHA_PATTERN,
    createManifest,
    validateReleaseManifest as validateManifest,
};
