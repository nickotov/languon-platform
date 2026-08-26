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
const DICTIONARY_JOB_FORMAT_PATTERN = /^[a-z][a-z0-9-]{0,63}:v(?:0|[1-9]\d*)$/;
const DICTIONARY_JOB_CAPABILITY_NAMES = [
    'workerProcessable',
    'apiReadable',
    'apiCancellable',
    'apiDiscardable',
    'apiAcceptable',
    'apiEnqueued',
    'webReadable',
];
const DICTIONARY_JOB_LIFECYCLE_CAPABILITY_NAMES =
    DICTIONARY_JOB_CAPABILITY_NAMES.filter((name) => name !== 'apiEnqueued');
const DICTIONARY_GENERATION_BUDGET_BOUNDS = Object.freeze({
    maxInputTokensPerAttempt: Object.freeze([32_768, 262_144]),
    maxOutputTokensPerAttempt: Object.freeze([128, 40_960]),
    inputCostMicrosPerMillionTokens: Object.freeze([1, 1_000_000_000]),
    outputCostMicrosPerMillionTokens: Object.freeze([1, 1_000_000_000]),
    maxCostMicrosPerAttempt: Object.freeze([1, 10_000_000]),
});

export const EMPTY_DICTIONARY_JOB_CAPABILITIES = Object.freeze({
    phase: 'expand',
    workerProcessable: Object.freeze([]),
    apiReadable: Object.freeze([]),
    apiCancellable: Object.freeze([]),
    apiDiscardable: Object.freeze([]),
    apiAcceptable: Object.freeze([]),
    apiEnqueued: Object.freeze([]),
    webReadable: Object.freeze([]),
    retireFormats: Object.freeze([]),
    generationBudget: null,
});

function normalizeGenerationBudget(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(
            'dictionaryJobs.generationBudget compatibility metadata is required.',
        );
    }
    const fieldNames = Object.keys(DICTIONARY_GENERATION_BUDGET_BOUNDS);
    if (Object.keys(value).sort().join(',') !== fieldNames.sort().join(',')) {
        throw new Error(
            `dictionaryJobs.generationBudget must contain exactly: ${fieldNames.join(', ')}.`,
        );
    }
    const budget = {};
    for (const [name, [minimum, maximum]] of Object.entries(
        DICTIONARY_GENERATION_BUDGET_BOUNDS,
    )) {
        const fieldValue = value[name];
        if (
            !Number.isSafeInteger(fieldValue) ||
            fieldValue < minimum ||
            fieldValue > maximum
        ) {
            throw new Error(
                `dictionaryJobs.generationBudget.${name} must be an integer between ${minimum} and ${maximum}.`,
            );
        }
        budget[name] = fieldValue;
    }
    const maximumPricedCost =
        Math.ceil(
            (budget.maxInputTokensPerAttempt *
                budget.inputCostMicrosPerMillionTokens) /
                1_000_000,
        ) +
        Math.ceil(
            (budget.maxOutputTokensPerAttempt *
                budget.outputCostMicrosPerMillionTokens) /
                1_000_000,
        );
    if (budget.maxCostMicrosPerAttempt < maximumPricedCost) {
        throw new Error(
            'dictionaryJobs.generationBudget.maxCostMicrosPerAttempt must cover the maximum priced input and output tokens.',
        );
    }
    return budget;
}

function normalizeFormats(value, name) {
    if (!Array.isArray(value)) {
        throw new Error(`dictionaryJobs.${name} must be an array.`);
    }
    const formats = [...value];
    if (
        formats.some(
            (format) =>
                typeof format !== 'string' ||
                !DICTIONARY_JOB_FORMAT_PATTERN.test(format),
        )
    ) {
        throw new Error(
            `dictionaryJobs.${name} contains an invalid composite format.`,
        );
    }
    if (new Set(formats).size !== formats.length) {
        throw new Error(`dictionaryJobs.${name} contains duplicate formats.`);
    }
    return formats.sort();
}

function assertSubset(formats, supported, description) {
    const unsupported = formats.filter((format) => !supported.includes(format));
    if (unsupported.length) {
        throw new Error(
            `${description} does not support dictionary job formats: ${unsupported.join(', ')}.`,
        );
    }
}

function normalizeDictionaryJobs(input, schemaVersion) {
    if (schemaVersion === 1) {
        if (input !== undefined) {
            throw new Error(
                'schemaVersion 1 cannot declare dictionaryJobs capabilities.',
            );
        }
        return {
            ...EMPTY_DICTIONARY_JOB_CAPABILITIES,
            workerProcessable: [],
            apiReadable: [],
            apiCancellable: [],
            apiDiscardable: [],
            apiAcceptable: [],
            apiEnqueued: [],
            webReadable: [],
            retireFormats: [],
            generationBudget: null,
        };
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new Error(
            'dictionaryJobs compatibility metadata is required for schemaVersion 2.',
        );
    }
    if (!['expand', 'activate'].includes(input.phase)) {
        throw new Error('dictionaryJobs.phase must be expand or activate.');
    }
    const capabilities = { phase: input.phase };
    for (const name of DICTIONARY_JOB_CAPABILITY_NAMES) {
        capabilities[name] = normalizeFormats(input[name], name);
    }
    capabilities.retireFormats = normalizeFormats(
        input.retireFormats,
        'retireFormats',
    );
    capabilities.generationBudget = normalizeGenerationBudget(
        input.generationBudget,
    );
    if (
        capabilities.phase === 'activate' &&
        capabilities.apiEnqueued.length === 0
    ) {
        throw new Error(
            'dictionaryJobs activate phase must enqueue at least one format.',
        );
    }
    for (const name of DICTIONARY_JOB_CAPABILITY_NAMES.filter(
        (name) => name !== 'apiEnqueued',
    )) {
        assertSubset(
            capabilities.apiEnqueued,
            capabilities[name],
            `Candidate ${name}`,
        );
    }
    return capabilities;
}

function assertEnqueuedBudgetClaimable(enqueuing, worker, description) {
    if (enqueuing.apiEnqueued.length === 0) return;
    const envelope = enqueuing.generationBudget;
    const workerCeilings = worker.generationBudget;
    if (!envelope || !workerCeilings) {
        throw new Error(
            `${description} has no compatible dictionary generation budget metadata.`,
        );
    }
    const incompatibilities = [];
    for (const name of [
        'maxInputTokensPerAttempt',
        'maxOutputTokensPerAttempt',
    ]) {
        if (envelope[name] > workerCeilings[name]) incompatibilities.push(name);
    }
    for (const name of [
        'inputCostMicrosPerMillionTokens',
        'outputCostMicrosPerMillionTokens',
        'maxCostMicrosPerAttempt',
    ]) {
        if (envelope[name] < workerCeilings[name]) incompatibilities.push(name);
    }
    if (incompatibilities.length > 0) {
        throw new Error(
            `${description} cannot claim API-enqueued dictionary job envelopes for ${enqueuing.apiEnqueued.join(', ')} because these generation budget fields are incompatible: ${incompatibilities.join(', ')}.`,
        );
    }
}

function assertSharedBudgetStableAcrossWorkerOverlap(candidate, rollbackFloor) {
    const overlappingFormats = candidate.workerProcessable.filter((format) =>
        rollbackFloor.workerProcessable.includes(format),
    );
    if (overlappingFormats.length === 0) return;
    const changedFields = Object.keys(
        DICTIONARY_GENERATION_BUDGET_BOUNDS,
    ).filter(
        (name) =>
            candidate.generationBudget?.[name] !==
            rollbackFloor.generationBudget?.[name],
    );
    if (changedFields.length > 0) {
        throw new Error(
            `dictionaryJobs.generationBudget must remain identical while worker formats overlap (${overlappingFormats.join(', ')}); changed fields: ${changedFields.join(', ')}.`,
        );
    }
}

function removedLifecycleFormats(candidate, rollbackFloor) {
    return [
        ...new Set(
            DICTIONARY_JOB_LIFECYCLE_CAPABILITY_NAMES.flatMap((capability) =>
                rollbackFloor[capability].filter(
                    (format) => !candidate[capability].includes(format),
                ),
            ),
        ),
    ].sort();
}

export function assertDictionaryJobRollbackCompatibility(
    candidate,
    rollbackFloor,
    { direction = 'forward' } = {},
) {
    if (!['forward', 'rollback'].includes(direction)) {
        throw new Error('Dictionary job compatibility direction is invalid.');
    }
    const candidateCapabilities =
        candidate.dictionaryJobs ?? EMPTY_DICTIONARY_JOB_CAPABILITIES;
    const rollbackCapabilities =
        rollbackFloor?.dictionaryJobs ?? EMPTY_DICTIONARY_JOB_CAPABILITIES;

    for (const [formats, release, label] of [
        [
            rollbackCapabilities.apiEnqueued,
            candidateCapabilities,
            'Candidate release',
        ],
        [
            candidateCapabilities.apiEnqueued,
            rollbackCapabilities,
            'Rollback-floor release',
        ],
    ]) {
        for (const capability of DICTIONARY_JOB_LIFECYCLE_CAPABILITY_NAMES) {
            assertSubset(
                formats,
                release[capability],
                `${label} ${capability}`,
            );
        }
    }
    assertEnqueuedBudgetClaimable(
        candidateCapabilities,
        rollbackCapabilities,
        'Rollback-floor worker',
    );
    assertEnqueuedBudgetClaimable(
        rollbackCapabilities,
        candidateCapabilities,
        'Candidate worker',
    );
    assertSharedBudgetStableAcrossWorkerOverlap(
        candidateCapabilities,
        rollbackCapabilities,
    );
    const newlyEnqueued = candidateCapabilities.apiEnqueued.filter(
        (format) => !rollbackCapabilities.apiEnqueued.includes(format),
    );
    if (
        direction === 'forward' &&
        candidateCapabilities.phase === 'expand' &&
        newlyEnqueued.length > 0
    ) {
        throw new Error(
            `dictionaryJobs expand phase cannot add API-enqueued formats: ${newlyEnqueued.join(', ')}.`,
        );
    }
    if (
        direction === 'forward' &&
        candidateCapabilities.phase === 'activate' &&
        newlyEnqueued.length === 0
    ) {
        throw new Error(
            'dictionaryJobs activate phase must add at least one API-enqueued format.',
        );
    }
    const removed = removedLifecycleFormats(
        candidateCapabilities,
        rollbackCapabilities,
    );
    if (
        direction === 'forward' &&
        removed.join(',') !== candidateCapabilities.retireFormats.join(',')
    ) {
        throw new Error(
            `dictionaryJobs.retireFormats must exactly declare removed lifecycle formats: ${removed.join(', ') || 'none'}.`,
        );
    }
    return removed;
}

export function validateReleaseManifest(input, expectations = {}) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
        throw new Error('Release manifest must be a JSON object.');
    }
    if (![1, 2].includes(input.schemaVersion)) {
        throw new Error('schemaVersion must be 1 or 2.');
    }
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
    const dictionaryJobs = normalizeDictionaryJobs(
        input.dictionaryJobs,
        input.schemaVersion,
    );
    return {
        schemaVersion: input.schemaVersion,
        identity: input.identity,
        version: input.version,
        sourceSha: input.sourceSha,
        verified: true,
        workflowRun: input.workflowRun,
        createdAt: input.createdAt,
        migration: { compatibility, ledger: input.migration.ledger },
        dictionaryJobs,
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
