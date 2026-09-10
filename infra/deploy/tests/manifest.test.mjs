import assert from 'node:assert/strict';
import test from 'node:test';
import {
    assertDictionaryJobRollbackCompatibility,
    validateReleaseManifest,
} from '../lib/manifest.mjs';

const digest = 'a'.repeat(64);
const generationBudget = {
    maxInputTokensPerAttempt: 65_536,
    maxOutputTokensPerAttempt: 1_024,
    inputCostMicrosPerMillionTokens: 1_000_000,
    outputCostMicrosPerMillionTokens: 4_000_000,
    maxCostMicrosPerAttempt: 70_000,
};
const valid = {
    schemaVersion: 2,
    identity: 'stage-abc',
    version: null,
    sourceSha: 'b'.repeat(40),
    verified: true,
    workflowRun: 42,
    createdAt: '2026-08-18T10:00:00.000Z',
    images: Object.fromEntries(
        ['backend', 'web', 'admin', 'migrator'].map((name) => [
            name,
            `ghcr.io/nick/languon-${name}@sha256:${digest}`,
        ]),
    ),
    migration: { compatibility: 'expand', ledger: 'drizzle' },
    dictionaryJobs: {
        phase: 'expand',
        workerProcessable: ['single-card:v1'],
        apiReadable: ['single-card:v1'],
        apiCancellable: ['single-card:v1'],
        apiDiscardable: ['single-card:v1'],
        apiAcceptable: ['single-card:v1'],
        apiEnqueued: [],
        webReadable: ['single-card:v1'],
        retireFormats: [],
        generationBudget,
    },
};

test('accepts an exact build-ready immutable manifest', () => {
    assert.deepEqual(validateReleaseManifest(valid), valid);
});

test('rejects mutable or incomplete image sets', () => {
    assert.throws(
        () =>
            validateReleaseManifest({
                ...valid,
                images: { ...valid.images, web: 'ghcr.io/nick/web:latest' },
            }),
        /sha256 digest/,
    );
    const { admin: _, ...images } = valid.images;
    assert.throws(
        () => validateReleaseManifest({ ...valid, images }),
        /exactly/,
    );
});

test('rejects destructive migration compatibility', () => {
    assert.throws(
        () =>
            validateReleaseManifest({
                ...valid,
                migration: { compatibility: 'contract', ledger: 'drizzle' },
            }),
        /Contract\/destructive/,
    );
});

test('permits local digest registry only with an explicit rehearsal option', () => {
    const images = Object.fromEntries(
        Object.keys(valid.images).map((name) => [
            name,
            `localhost:5500/languon/${name}@sha256:${digest}`,
        ]),
    );
    assert.throws(
        () => validateReleaseManifest({ ...valid, images }),
        /permitted/,
    );
    assert.equal(
        validateReleaseManifest(
            { ...valid, images },
            { allowLocalRegistry: true },
        ).images.web,
        images.web,
    );
});

test('normalizes historical schema-v1 manifests to no dictionary job capabilities', () => {
    const { dictionaryJobs: _, ...historical } = valid;
    const normalized = validateReleaseManifest({
        ...historical,
        schemaVersion: 1,
    });
    assert.deepEqual(normalized.dictionaryJobs.apiEnqueued, []);
    assert.deepEqual(normalized.dictionaryJobs.workerProcessable, []);
    assert.deepEqual(normalized.dictionaryJobs.retireFormats, []);
    assert.equal(normalized.dictionaryJobs.generationBudget, null);
    assert.throws(
        () => validateReleaseManifest({ ...valid, schemaVersion: 1 }),
        /cannot declare dictionaryJobs/,
    );
});

test('requires a complete self-covering generation budget in schema v2', () => {
    assert.throws(
        () =>
            validateReleaseManifest({
                ...valid,
                dictionaryJobs: {
                    ...valid.dictionaryJobs,
                    generationBudget: undefined,
                },
            }),
        /generationBudget compatibility metadata is required/,
    );
    assert.throws(
        () =>
            validateReleaseManifest({
                ...valid,
                dictionaryJobs: {
                    ...valid.dictionaryJobs,
                    generationBudget: {
                        ...generationBudget,
                        maxInputTokensPerAttempt: 262_145,
                    },
                },
            }),
        /maxInputTokensPerAttempt/,
    );
    assert.throws(
        () =>
            validateReleaseManifest({
                ...valid,
                dictionaryJobs: {
                    ...valid.dictionaryJobs,
                    generationBudget: {
                        ...generationBudget,
                        maxInputTokensPerAttempt: 32_767,
                    },
                },
            }),
        /maxInputTokensPerAttempt/,
    );
    assert.equal(
        validateReleaseManifest({
            ...valid,
            dictionaryJobs: {
                ...valid.dictionaryJobs,
                generationBudget: {
                    maxInputTokensPerAttempt: 32_768,
                    maxOutputTokensPerAttempt: 128,
                    inputCostMicrosPerMillionTokens: 1,
                    outputCostMicrosPerMillionTokens: 1,
                    maxCostMicrosPerAttempt: 2,
                },
            },
        }).dictionaryJobs.generationBudget.maxInputTokensPerAttempt,
        32_768,
    );
    assert.throws(
        () =>
            validateReleaseManifest({
                ...valid,
                dictionaryJobs: {
                    ...valid.dictionaryJobs,
                    generationBudget: {
                        ...generationBudget,
                        maxCostMicrosPerAttempt: 69_631,
                    },
                },
            }),
        /must cover/,
    );
});

test('requires explicit complete self-compatible capabilities in schema v2', () => {
    assert.throws(
        () =>
            validateReleaseManifest({
                ...valid,
                dictionaryJobs: undefined,
            }),
        /compatibility metadata is required/,
    );
    assert.throws(
        () =>
            validateReleaseManifest({
                ...valid,
                dictionaryJobs: {
                    ...valid.dictionaryJobs,
                    phase: 'activate',
                    apiEnqueued: ['single-card:v1'],
                    apiAcceptable: [],
                },
            }),
        /Candidate apiAcceptable does not support/,
    );
});

test('preflight enforces full lifecycle compatibility in both rollback directions', () => {
    const expand = validateReleaseManifest(valid);
    const activate = validateReleaseManifest({
        ...valid,
        identity: 'stage-activate',
        dictionaryJobs: {
            ...valid.dictionaryJobs,
            phase: 'activate',
            apiEnqueued: ['single-card:v1'],
        },
    });
    assert.deepEqual(
        assertDictionaryJobRollbackCompatibility(activate, expand),
        [],
    );

    const historical = validateReleaseManifest({
        ...valid,
        schemaVersion: 1,
        dictionaryJobs: undefined,
    });
    assert.throws(
        () => assertDictionaryJobRollbackCompatibility(activate, historical),
        /Rollback-floor release workerProcessable/,
    );
    assert.throws(
        () =>
            assertDictionaryJobRollbackCompatibility(
                {
                    ...expand,
                    dictionaryJobs: {
                        ...expand.dictionaryJobs,
                        workerProcessable: [],
                    },
                },
                activate,
            ),
        /Candidate release workerProcessable/,
    );
});

test('card-authoring format follows expand-before-activate and remains lifecycle-readable across rollback', () => {
    const format = 'card-authoring:v1';
    const lifecycle = {
        workerProcessable: [format],
        apiReadable: [format],
        apiCancellable: [format],
        apiDiscardable: [format],
        apiAcceptable: [format],
        webReadable: [format],
    };
    const expand = validateReleaseManifest({
        ...valid,
        identity: 'card-authoring-expand',
        dictionaryJobs: {
            ...valid.dictionaryJobs,
            ...lifecycle,
            apiEnqueued: [],
        },
    });
    const activate = validateReleaseManifest({
        ...expand,
        identity: 'card-authoring-activate',
        dictionaryJobs: {
            ...expand.dictionaryJobs,
            phase: 'activate',
            apiEnqueued: [format],
        },
    });

    assert.deepEqual(
        assertDictionaryJobRollbackCompatibility(activate, expand),
        [],
    );
    assert.deepEqual(
        assertDictionaryJobRollbackCompatibility(activate, expand, {
            direction: 'rollback',
        }),
        [],
    );
    assert.throws(
        () =>
            assertDictionaryJobRollbackCompatibility(
                {
                    ...activate,
                    dictionaryJobs: {
                        ...activate.dictionaryJobs,
                        apiReadable: [],
                    },
                },
                expand,
            ),
        /retireFormats must exactly declare.*card-authoring:v1/i,
    );
});

test('expand cannot add enqueue formats and activate must add one', () => {
    const expand = validateReleaseManifest(valid);
    const enqueuingExpand = validateReleaseManifest({
        ...valid,
        identity: 'stage-invalid-expand',
        dictionaryJobs: {
            ...valid.dictionaryJobs,
            apiEnqueued: ['single-card:v1'],
        },
    });
    assert.throws(
        () => assertDictionaryJobRollbackCompatibility(enqueuingExpand, expand),
        /expand phase cannot add API-enqueued formats/,
    );

    const activate = validateReleaseManifest({
        ...enqueuingExpand,
        identity: 'stage-activate',
        dictionaryJobs: {
            ...enqueuingExpand.dictionaryJobs,
            phase: 'activate',
        },
    });
    assert.deepEqual(
        assertDictionaryJobRollbackCompatibility(activate, expand),
        [],
    );
    assert.throws(
        () => assertDictionaryJobRollbackCompatibility(activate, activate),
        /activate phase must add at least one API-enqueued format/,
    );
    assert.deepEqual(
        assertDictionaryJobRollbackCompatibility(activate, activate, {
            direction: 'rollback',
        }),
        [],
    );
});

test('lifecycle support removal requires an exact retirement declaration', () => {
    const rollbackFloor = validateReleaseManifest(valid);
    const withoutLifecycleSupport = {
        ...rollbackFloor,
        identity: 'stage-retire',
        dictionaryJobs: {
            phase: 'expand',
            workerProcessable: [],
            apiReadable: [],
            apiCancellable: [],
            apiDiscardable: [],
            apiAcceptable: [],
            apiEnqueued: [],
            webReadable: [],
            retireFormats: [],
        },
    };

    assert.throws(
        () =>
            assertDictionaryJobRollbackCompatibility(
                withoutLifecycleSupport,
                rollbackFloor,
            ),
        /retireFormats must exactly declare.*single-card:v1/,
    );
    assert.deepEqual(
        assertDictionaryJobRollbackCompatibility(
            {
                ...withoutLifecycleSupport,
                dictionaryJobs: {
                    ...withoutLifecycleSupport.dictionaryJobs,
                    retireFormats: ['single-card:v1'],
                },
            },
            rollbackFloor,
        ),
        ['single-card:v1'],
    );
    const historical = validateReleaseManifest({
        ...valid,
        schemaVersion: 1,
        dictionaryJobs: undefined,
    });
    assert.deepEqual(
        assertDictionaryJobRollbackCompatibility(historical, rollbackFloor, {
            direction: 'rollback',
        }),
        ['single-card:v1'],
    );
});

test('activation and steady releases preserve claimable budget envelopes across rollback', () => {
    const floor = validateReleaseManifest(valid);
    const underpricedActivation = validateReleaseManifest({
        ...valid,
        identity: 'stage-underpriced-activation',
        dictionaryJobs: {
            ...valid.dictionaryJobs,
            phase: 'activate',
            apiEnqueued: ['single-card:v1'],
            generationBudget: {
                ...generationBudget,
                inputCostMicrosPerMillionTokens: 500_000,
                maxCostMicrosPerAttempt: 70_000,
            },
        },
    });
    assert.throws(
        () =>
            assertDictionaryJobRollbackCompatibility(
                underpricedActivation,
                floor,
            ),
        /Rollback-floor worker cannot claim.*inputCostMicrosPerMillionTokens/,
    );

    const activation = validateReleaseManifest({
        ...valid,
        identity: 'stage-budget-activation',
        dictionaryJobs: {
            ...valid.dictionaryJobs,
            phase: 'activate',
            apiEnqueued: ['single-card:v1'],
        },
    });
    assert.deepEqual(
        assertDictionaryJobRollbackCompatibility(activation, floor),
        [],
    );

    const underpricedSteady = validateReleaseManifest({
        ...activation,
        identity: 'stage-underpriced-steady',
        dictionaryJobs: {
            ...activation.dictionaryJobs,
            phase: 'expand',
            generationBudget: {
                ...generationBudget,
                outputCostMicrosPerMillionTokens: 3_000_000,
            },
        },
    });
    assert.throws(
        () =>
            assertDictionaryJobRollbackCompatibility(
                underpricedSteady,
                activation,
            ),
        /Rollback-floor worker cannot claim.*outputCostMicrosPerMillionTokens/,
    );

    const changedAfterStopEnqueue = validateReleaseManifest({
        ...underpricedSteady,
        identity: 'stage-changed-after-stop-enqueue',
        dictionaryJobs: {
            ...underpricedSteady.dictionaryJobs,
            apiEnqueued: [],
        },
    });
    assert.throws(
        () =>
            assertDictionaryJobRollbackCompatibility(
                changedAfterStopEnqueue,
                activation,
            ),
        /generationBudget must remain identical while worker formats overlap/,
    );

    const steady = validateReleaseManifest({
        ...activation,
        identity: 'stage-budget-steady',
        dictionaryJobs: {
            ...activation.dictionaryJobs,
            phase: 'expand',
        },
    });
    assert.deepEqual(
        assertDictionaryJobRollbackCompatibility(steady, activation),
        [],
    );
    assert.deepEqual(
        assertDictionaryJobRollbackCompatibility(activation, steady, {
            direction: 'rollback',
        }),
        [],
    );
});
