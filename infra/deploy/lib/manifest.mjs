import { readFile } from 'node:fs/promises';

export const IMAGE_NAMES = ['backend', 'web', 'admin', 'migrator'];
export const SHA_PATTERN = /^[a-f0-9]{40}$/;
export const SEMVER_PATTERN =
    /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/;
export const DIGEST_IMAGE_PATTERN =
    /^ghcr\.io\/[a-z0-9](?:[a-z0-9._/-]*[a-z0-9])?@sha256:[a-f0-9]{64}$/;
export const LOCAL_DIGEST_IMAGE_PATTERN =
    /^(?:localhost|127\.0\.0\.1):\d+\/[a-z0-9][a-z0-9._/-]*@sha256:[a-f0-9]{64}$/;
const IDENTITY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

export function validateReleaseManifest(input, expectations = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new Error('Release manifest must be a JSON object.');
    }
    if (input.schemaVersion !== 1) throw new Error('schemaVersion must be 1.');
    if (input.verified !== true)
        throw new Error('Release manifest is not build-ready.');
    if (!SHA_PATTERN.test(input.sourceSha ?? '')) {
        throw new Error('sourceSha must be 40 lowercase hex characters.');
    }
    if (!IDENTITY_PATTERN.test(input.identity ?? ''))
        throw new Error('identity is invalid.');
    if (input.version !== null && !SEMVER_PATTERN.test(input.version ?? '')) {
        throw new Error(
            'version must be null or a stable vMAJOR.MINOR.PATCH version.',
        );
    }
    if (!Number.isSafeInteger(input.workflowRun) || input.workflowRun < 1) {
        throw new Error('workflowRun must be a positive integer.');
    }
    if (
        typeof input.createdAt !== 'string' ||
        Number.isNaN(Date.parse(input.createdAt))
    ) {
        throw new Error('createdAt must be an ISO timestamp.');
    }
    if (
        !input.images ||
        typeof input.images !== 'object' ||
        Array.isArray(input.images)
    ) {
        throw new Error('images must be an object.');
    }
    if (
        Object.keys(input.images).sort().join(',') !==
        [...IMAGE_NAMES].sort().join(',')
    ) {
        throw new Error(
            `images must contain exactly: ${IMAGE_NAMES.join(', ')}.`,
        );
    }
    for (const service of IMAGE_NAMES) {
        const image = input.images[service] ?? '';
        if (
            !DIGEST_IMAGE_PATTERN.test(image) &&
            !(
                expectations.allowLocalRegistry &&
                LOCAL_DIGEST_IMAGE_PATTERN.test(image)
            )
        ) {
            throw new Error(
                `${service} image must be a permitted sha256 digest reference.`,
            );
        }
        if (
            expectations.imagePrefix &&
            !image.startsWith(expectations.imagePrefix)
        ) {
            throw new Error(
                `${service} image does not belong to ${expectations.imagePrefix}.`,
            );
        }
    }
    if (!input.migration || typeof input.migration !== 'object') {
        throw new Error('migration compatibility metadata is required.');
    }
    const compatibility = input.migration.compatibility;
    if (!['none', 'expand', 'migrate'].includes(compatibility)) {
        throw new Error(
            'Contract/destructive migrations cannot run during blue/green deployment.',
        );
    }
    if (!/^[A-Za-z0-9._:-]{1,128}$/.test(input.migration.ledger ?? '')) {
        throw new Error('migration ledger identity is invalid.');
    }
    if (expectations.sourceSha && input.sourceSha !== expectations.sourceSha) {
        throw new Error(
            `Manifest sourceSha does not match expected commit ${expectations.sourceSha}.`,
        );
    }
    if (expectations.version && input.version !== expectations.version) {
        throw new Error(
            `Manifest version does not match expected release ${expectations.version}.`,
        );
    }
    return {
        schemaVersion: 1,
        identity: input.identity,
        version: input.version,
        sourceSha: input.sourceSha,
        verified: true,
        workflowRun: input.workflowRun,
        createdAt: input.createdAt,
        migration: { compatibility, ledger: input.migration.ledger },
        images: Object.fromEntries(
            IMAGE_NAMES.map((service) => [service, input.images[service]]),
        ),
    };
}

export async function readReleaseManifest(path, expectations) {
    let parsed;
    try {
        parsed = JSON.parse(await readFile(path, 'utf8'));
    } catch (error) {
        throw new Error(`Cannot read release manifest at ${path}.`, {
            cause: error,
        });
    }
    return validateReleaseManifest(parsed, expectations);
}
