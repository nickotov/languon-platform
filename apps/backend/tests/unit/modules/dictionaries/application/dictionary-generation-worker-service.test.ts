import { createHash } from 'node:crypto';

import { describe, expect, it, vi } from 'vitest';

import { DictionaryGenerationWorkerService } from '../../../../../src/modules/dictionaries/application/dictionary-generation-worker-service';
import { CardProposalGeneratorError } from '../../../../../src/modules/dictionaries/application/ports/card-proposal-generator';
import { CardAuthoringProposalGeneratorError } from '../../../../../src/modules/dictionaries/application/ports/card-authoring-proposal-generator';
import { DictionaryGenerationCompletionConflictError } from '../../../../../src/modules/dictionaries/application/dictionary-errors';
import { defaultDictionaryGenerationProviderBudgetPolicy } from '../../../../../src/modules/dictionaries/application/ports/dictionary-generation-provider-policy';
import type { PastedTermsProposalGeneratorRequest } from '../../../../../src/modules/dictionaries/application/ports/pasted-terms-proposal-generator';
import type { ImportPairsProposalGeneratorRequest } from '../../../../../src/modules/dictionaries/application/ports/import-pairs-proposal-generator';
import type { DictionaryGenerationStore } from '../../../../../src/modules/dictionaries/application/ports/dictionary-generation-store';
import {
    dictionaryGenerationFormat,
    dictionaryImportPairsGenerationFormat,
    dictionaryPastedTermsGenerationFormat,
} from '../../../../../src/modules/dictionaries/domain/generation';
import { InvalidDictionarySettingsError } from '../../../../../src/modules/dictionaries/domain/settings';
import { dictionaryDocumentGenerationFormat } from '../../../../../src/modules/dictionaries/domain/document-ingestion';
import { dictionaryCardAuthoringGenerationFormat } from '../../../../../src/modules/dictionaries/domain/card-authoring';
import {
    DictionaryDocumentGenerationError,
    DictionaryDocumentGenerationProcessor,
} from '../../../../../src/modules/dictionaries/application/dictionary-document-generation-processor';
import { DictionaryDocumentGenerationExecutor } from '../../../../../src/modules/dictionaries/application/dictionary-document-generation-executor';
import type { DictionaryDocumentStore } from '../../../../../src/modules/dictionaries/application/ports/dictionary-document-store';
import { DeterministicPastedTermsProposalGenerator } from '../../../../../src/modules/dictionaries/infrastructure/ai/pasted-terms-proposal-generators';
import {
    DeterministicDocumentMalwareScanner,
    DeterministicDocumentOcrProvider,
    DeterministicPrivateDocumentStorage,
    DeterministicSandboxedDocumentExtractor,
} from '../../../../../src/modules/dictionaries/infrastructure/document/deterministic-document-adapters';

const input = {
    context: {
        cardId: '00000000-0000-4000-8000-000000000003',
        dictionaryId: '00000000-0000-4000-8000-000000000002',
        expectedCardVersion: 1,
        expectedDictionaryVersion: 2,
        expectedSettingsVersion: 1,
        sourceLanguage: 'en',
        targetLanguage: 'fr',
    },
    format: dictionaryGenerationFormat,
    instruction: null,
    original: {
        authorship: 'human' as const,
        effectiveSettings: {
            definitionEnabled: false,
            definitionLanguage: 'source' as const,
            exampleEnabled: true,
            exampleLanguage: 'source' as const,
            exampleTranslationEnabled: true,
            exampleTranslationLanguage: 'target' as const,
            transcriptionCustomLabel: null,
            transcriptionEnabled: false,
            transcriptionNotation: 'ipa' as const,
        },
        overrides: {
            definitionEnabled: null,
            definitionLanguage: null,
            exampleEnabled: null,
            exampleLanguage: null,
            exampleTranslationEnabled: null,
            transcriptionCustomLabel: null,
            transcriptionEnabled: null,
            transcriptionNotation: null,
        },
        values: {
            definition: null,
            example: null,
            exampleTranslation: null,
            source: 'hello',
            transcription: null,
            translation: 'bonjour',
        },
    },
};

const proposal = {
    candidate: {
        overrides: input.original.overrides,
        values: input.original.values,
    },
    fieldFeedback: [],
    warnings: [],
};

const cardAuthoringInput = {
    context: {
        dictionaryId: '00000000-0000-4000-8000-000000000002',
        expectedDictionaryVersion: 2,
        expectedSettingsVersion: 1,
        sourceLanguage: 'en',
        targetLanguage: 'fr',
    },
    draft: {
        overrides: input.original.overrides,
        values: {
            definition: null,
            example: 'Hello there.',
            exampleTranslation: null,
            transcription: null,
            translation: null,
        },
    },
    effectiveSettings: input.original.effectiveSettings,
    excludedValues: [],
    format: dictionaryCardAuthoringGenerationFormat,
    scope: { kind: 'all' as const },
    source: 'hello',
};

function store(overrides: Partial<DictionaryGenerationStore> = {}) {
    const implementation = {
        claim: vi.fn(async () => ({
            attempt: 1,
            fencingToken: 1n,
            id: '00000000-0000-4000-8000-000000000004',
            input,
            leaseDeadline: new Date('2026-08-21T12:00:00.100Z'),
            providerBudget: defaultDictionaryGenerationProviderBudgetPolicy,
            workerId: 'worker-a',
        })),
        complete: vi.fn(async () => true),
        expireReviewPayloads: vi.fn(async () => 0),
        fail: vi.fn(async () => true),
        heartbeat: vi.fn(async () => true),
        readiness: vi.fn(async () => undefined),
        releaseWorkerLeases: vi.fn(async () => undefined),
        ...overrides,
    } as unknown as DictionaryGenerationStore;
    return implementation;
}

describe('DictionaryGenerationWorkerService', () => {
    it('dispatches card authoring to its provider and completes with a validated field delta under the claimed budget', async () => {
        const generationStore = store({
            claim: vi.fn(async () => ({
                attempt: 1,
                fencingToken: 1n,
                id: '00000000-0000-4000-8000-000000000004',
                input: cardAuthoringInput,
                leaseDeadline: new Date('2026-08-21T12:00:00.100Z'),
                providerBudget: defaultDictionaryGenerationProviderBudgetPolicy,
                workerId: 'worker-a',
            })),
        });
        const generate = vi.fn(async () => ({
            delta: {
                suggestions: [
                    { field: 'translation' as const, value: 'bonjour' },
                    {
                        field: 'example' as const,
                        value: 'Hello, my friend.',
                    },
                    {
                        field: 'exampleTranslation' as const,
                        value: 'Bonjour, mon ami.',
                    },
                ],
            },
            usage: { inputTokens: 80, outputTokens: 24 },
        }));
        const service = new DictionaryGenerationWorkerService(
            {
                cardAuthoringProvider: { generate },
                clock: { now: () => new Date('2026-08-21T12:00:00.000Z') },
                provider: { generate: vi.fn() },
                store: generationStore,
            },
            {
                heartbeatIntervalMs: 10,
                leaseDurationMs: 100,
                providerTimeoutMs: 50,
            },
        );

        await expect(
            service.processNext({
                signal: new AbortController().signal,
                supportedFormats: [dictionaryCardAuthoringGenerationFormat],
                workerId: 'worker-a',
            }),
        ).resolves.toBe(true);

        expect(generate).toHaveBeenCalledWith({
            idempotencyKey: '00000000-0000-4000-8000-000000000004/generate',
            input: {
                effectiveSettings: cardAuthoringInput.effectiveSettings,
                fieldContext: [
                    {
                        currentValue: null,
                        excludedValues: [],
                        field: 'translation',
                    },
                    {
                        currentValue: 'Hello there.',
                        excludedValues: [],
                        field: 'example',
                    },
                    {
                        currentValue: null,
                        excludedValues: [],
                        field: 'exampleTranslation',
                    },
                ],
                requestedFields: [
                    'translation',
                    'example',
                    'exampleTranslation',
                ],
                source: 'hello',
                sourceLanguage: 'en',
                targetLanguage: 'fr',
            },
            providerBudget: defaultDictionaryGenerationProviderBudgetPolicy,
            signal: expect.any(AbortSignal),
        });
        expect(generationStore.complete).toHaveBeenCalledWith(
            expect.objectContaining({
                proposal: {
                    suggestions: [
                        { field: 'translation', value: 'bonjour' },
                        { field: 'example', value: 'Hello, my friend.' },
                        {
                            field: 'exampleTranslation',
                            value: 'Bonjour, mon ami.',
                        },
                    ],
                },
                providerUsage: { inputTokens: 80, outputTokens: 24 },
            }),
        );
    });

    it('sanitizes card-authoring provider failures and rejects over-budget usage before completion', async () => {
        const generationStore = store({
            claim: vi.fn(async () => ({
                attempt: 1,
                fencingToken: 1n,
                id: '00000000-0000-4000-8000-000000000004',
                input: cardAuthoringInput,
                leaseDeadline: new Date('2026-08-21T12:00:00.100Z'),
                providerBudget: defaultDictionaryGenerationProviderBudgetPolicy,
                workerId: 'worker-a',
            })),
        });
        const service = new DictionaryGenerationWorkerService(
            {
                cardAuthoringProvider: {
                    generate: vi.fn(async () => ({
                        delta: { suggestions: [] },
                        usage: {
                            inputTokens:
                                defaultDictionaryGenerationProviderBudgetPolicy.maxInputTokensPerAttempt +
                                1,
                            outputTokens: 1,
                        },
                    })),
                },
                clock: { now: () => new Date('2026-08-21T12:00:00.000Z') },
                provider: { generate: vi.fn() },
                store: generationStore,
            },
            {
                heartbeatIntervalMs: 10,
                leaseDurationMs: 100,
                providerTimeoutMs: 50,
            },
        );

        await service.processNext({
            signal: new AbortController().signal,
            supportedFormats: [dictionaryCardAuthoringGenerationFormat],
            workerId: 'worker-a',
        });

        expect(generationStore.complete).not.toHaveBeenCalled();
        expect(generationStore.fail).toHaveBeenCalledWith(
            expect.objectContaining({
                failureCategory: 'invalid_model_output',
                retryAt: null,
            }),
        );

        const providerFailureStore = store({
            claim: generationStore.claim,
        });
        const providerFailure = new DictionaryGenerationWorkerService(
            {
                cardAuthoringProvider: {
                    generate: vi.fn(async () => {
                        throw new CardAuthoringProposalGeneratorError(
                            'provider_rate_limited',
                        );
                    }),
                },
                clock: { now: () => new Date('2026-08-21T12:00:00.000Z') },
                provider: { generate: vi.fn() },
                store: providerFailureStore,
            },
            {
                heartbeatIntervalMs: 10,
                leaseDurationMs: 100,
                providerTimeoutMs: 50,
            },
        );
        await providerFailure.processNext({
            signal: new AbortController().signal,
            supportedFormats: [dictionaryCardAuthoringGenerationFormat],
            workerId: 'worker-a',
        });
        expect(providerFailureStore.fail).toHaveBeenCalledWith(
            expect.objectContaining({
                failureCategory: 'provider_rate_limited',
                retryAt: expect.any(Date),
            }),
        );
    });

    it('rejects a card-authoring delta containing a field outside the requested scope', async () => {
        const fieldInput = {
            ...cardAuthoringInput,
            predecessor: {
                discardedSuggestionIds: [],
                jobId: '00000000-0000-4000-8000-000000000006',
            },
            scope: { kind: 'field' as const, field: 'translation' as const },
        };
        const generationStore = store({
            claim: vi.fn(async () => ({
                attempt: 1,
                fencingToken: 1n,
                id: '00000000-0000-4000-8000-000000000004',
                input: fieldInput,
                leaseDeadline: new Date('2026-08-21T12:00:00.100Z'),
                providerBudget: defaultDictionaryGenerationProviderBudgetPolicy,
                workerId: 'worker-a',
            })),
        });
        const service = new DictionaryGenerationWorkerService(
            {
                cardAuthoringProvider: {
                    generate: vi.fn(async () => ({
                        suggestions: [
                            { field: 'example' as const, value: 'Hello.' },
                        ],
                    })),
                },
                clock: { now: () => new Date('2026-08-21T12:00:00.000Z') },
                provider: { generate: vi.fn() },
                store: generationStore,
            },
            {
                heartbeatIntervalMs: 10,
                leaseDurationMs: 100,
                providerTimeoutMs: 50,
            },
        );

        await service.processNext({
            signal: new AbortController().signal,
            supportedFormats: [dictionaryCardAuthoringGenerationFormat],
            workerId: 'worker-a',
        });

        expect(generationStore.complete).not.toHaveBeenCalled();
        expect(generationStore.fail).toHaveBeenCalledWith(
            expect.objectContaining({
                failureCategory: 'invalid_model_output',
                retryAt: null,
            }),
        );
    });

    it.each([
        {
            name: 'duplicate field output',
            delta: {
                suggestions: [
                    { field: 'translation', value: 'bonjour' },
                    { field: 'translation', value: 'salut' },
                ],
            },
        },
        { name: 'missing requested output', delta: { suggestions: [] } },
    ])(
        'terminally sanitizes $name and settles valid returned usage',
        async ({ delta }) => {
            const generationStore = store({
                claim: vi.fn(async () => ({
                    attempt: 1,
                    fencingToken: 1n,
                    id: '00000000-0000-4000-8000-000000000004',
                    input: cardAuthoringInput,
                    leaseDeadline: new Date('2026-08-21T12:00:00.100Z'),
                    providerBudget:
                        defaultDictionaryGenerationProviderBudgetPolicy,
                    workerId: 'worker-a',
                })),
            });
            const service = new DictionaryGenerationWorkerService(
                {
                    cardAuthoringProvider: {
                        generate: vi.fn(async () => ({
                            delta,
                            usage: { inputTokens: 91, outputTokens: 17 },
                        })) as never,
                    },
                    clock: {
                        now: () => new Date('2026-08-21T12:00:00.000Z'),
                    },
                    provider: { generate: vi.fn() },
                    store: generationStore,
                },
                {
                    heartbeatIntervalMs: 10,
                    leaseDurationMs: 100,
                    providerTimeoutMs: 50,
                },
            );

            await service.processNext({
                signal: new AbortController().signal,
                supportedFormats: [dictionaryCardAuthoringGenerationFormat],
                workerId: 'worker-a',
            });

            expect(generationStore.complete).not.toHaveBeenCalled();
            expect(generationStore.fail).toHaveBeenCalledWith(
                expect.objectContaining({
                    failureCategory: 'invalid_model_output',
                    providerUsage: { inputTokens: 91, outputTokens: 17 },
                    retryAt: null,
                }),
            );
        },
    );

    it.each(['predecessor_changed', 'suggestion_capacity_reached'] as const)(
        'terminally settles returned usage for the non-provider %s completion conflict',
        async (reason) => {
            const generationStore = store({
                claim: vi.fn(async () => ({
                    attempt: 1,
                    fencingToken: 1n,
                    id: '00000000-0000-4000-8000-000000000004',
                    input: cardAuthoringInput,
                    leaseDeadline: new Date('2026-08-21T12:00:00.100Z'),
                    providerBudget:
                        defaultDictionaryGenerationProviderBudgetPolicy,
                    workerId: 'worker-a',
                })),
                complete: vi.fn(async () => {
                    throw new DictionaryGenerationCompletionConflictError(
                        reason,
                    );
                }),
            });
            const service = new DictionaryGenerationWorkerService(
                {
                    cardAuthoringProvider: {
                        generate: vi.fn(async () => ({
                            delta: {
                                suggestions: [
                                    {
                                        field: 'translation' as const,
                                        value: 'bonjour',
                                    },
                                    {
                                        field: 'example' as const,
                                        value: 'Hello, my friend.',
                                    },
                                    {
                                        field: 'exampleTranslation' as const,
                                        value: 'Bonjour, mon ami.',
                                    },
                                ],
                            },
                            usage: { inputTokens: 101, outputTokens: 23 },
                        })),
                    },
                    clock: {
                        now: () => new Date('2026-08-21T12:00:00.000Z'),
                    },
                    provider: { generate: vi.fn() },
                    store: generationStore,
                },
                {
                    heartbeatIntervalMs: 10,
                    leaseDurationMs: 100,
                    providerTimeoutMs: 50,
                },
            );

            await expect(
                service.processNext({
                    signal: new AbortController().signal,
                    supportedFormats: [dictionaryCardAuthoringGenerationFormat],
                    workerId: 'worker-a',
                }),
            ).resolves.toBe(true);

            expect(generationStore.fail).toHaveBeenCalledWith(
                expect.objectContaining({
                    countProviderFailure: false,
                    failureCategory: 'generation_conflict',
                    providerUsage: { inputTokens: 101, outputTokens: 23 },
                    retryAt: null,
                }),
            );
        },
    );

    it('uses a stable provider key, validates output, records validating progress, and completes fenced work', async () => {
        const generationStore = store();
        const generate = vi.fn(async () => ({
            proposal,
            usage: { inputTokens: 120, outputTokens: 48 },
        }));
        const service = new DictionaryGenerationWorkerService(
            {
                clock: { now: () => new Date('2026-08-21T12:00:00.000Z') },
                provider: { generate },
                store: generationStore,
            },
            {
                heartbeatIntervalMs: 10,
                leaseDurationMs: 100,
                providerTimeoutMs: 50,
            },
        );

        await expect(
            service.processNext({
                signal: new AbortController().signal,
                supportedFormats: [dictionaryGenerationFormat],
                workerId: 'worker-a',
            }),
        ).resolves.toBe(true);

        expect(generate).toHaveBeenCalledWith(
            expect.objectContaining({
                idempotencyKey: '00000000-0000-4000-8000-000000000004/generate',
            }),
        );
        expect(generationStore.heartbeat).toHaveBeenCalledWith(
            expect.objectContaining({
                progress: { percent: 90, stage: 'validating' },
            }),
        );
        expect(generationStore.complete).toHaveBeenCalledWith(
            expect.objectContaining({
                providerUsage: { inputTokens: 120, outputTokens: 48 },
            }),
        );
    });

    it('rejects malformed provider output before persistence with a sanitized terminal category', async () => {
        const generationStore = store();
        const service = new DictionaryGenerationWorkerService(
            {
                clock: { now: () => new Date('2026-08-21T12:00:00.000Z') },
                provider: { generate: async () => ({}) as never },
                store: generationStore,
            },
            {
                heartbeatIntervalMs: 10,
                leaseDurationMs: 100,
                providerTimeoutMs: 50,
            },
        );

        await service.processNext({
            signal: new AbortController().signal,
            supportedFormats: [dictionaryGenerationFormat],
            workerId: 'worker-a',
        });

        expect(generationStore.complete).not.toHaveBeenCalled();
        expect(generationStore.fail).toHaveBeenCalledWith(
            expect.objectContaining({
                failureCategory: 'invalid_model_output',
                retryAt: null,
            }),
        );
    });

    it('does not terminal-fail work when root shutdown aborts the provider', async () => {
        const generationStore = store();
        const controller = new AbortController();
        const service = new DictionaryGenerationWorkerService(
            {
                clock: { now: () => new Date('2026-08-21T12:00:00.000Z') },
                provider: {
                    generate: ({ signal }) =>
                        new Promise((_resolve, reject) =>
                            signal.addEventListener(
                                'abort',
                                () => reject(signal.reason),
                                { once: true },
                            ),
                        ),
                },
                store: generationStore,
            },
            {
                heartbeatIntervalMs: 10,
                leaseDurationMs: 100,
                providerTimeoutMs: 50,
            },
        );
        const processing = service.processNext({
            signal: controller.signal,
            supportedFormats: [dictionaryGenerationFormat],
            workerId: 'worker-a',
        });
        controller.abort(new Error('shutdown'));

        await expect(processing).resolves.toBe(true);
        expect(generationStore.fail).not.toHaveBeenCalled();
    });

    it('runs bounded provider readiness without invoking generation and fails closed when no probe exists', async () => {
        const generationStore = store();
        const generate = vi.fn();
        const readiness = vi.fn(async () => undefined);
        const service = new DictionaryGenerationWorkerService(
            {
                clock: { now: () => new Date('2026-08-21T12:00:00.000Z') },
                provider: { generate, readiness },
                store: generationStore,
            },
            {
                heartbeatIntervalMs: 10,
                leaseDurationMs: 100,
                providerTimeoutMs: 50,
            },
        );
        const signal = new AbortController().signal;

        await expect(
            service.readiness(signal, { includeProvider: true }),
        ).resolves.toBeUndefined();
        expect(generationStore.readiness).toHaveBeenCalledWith(signal);
        expect(readiness).toHaveBeenCalledOnce();
        expect(generate).not.toHaveBeenCalled();

        const missingProbe = new DictionaryGenerationWorkerService(
            {
                clock: { now: () => new Date('2026-08-21T12:00:00.000Z') },
                provider: { generate },
                store: generationStore,
            },
            {
                heartbeatIntervalMs: 10,
                leaseDurationMs: 100,
                providerTimeoutMs: 50,
            },
        );
        await expect(
            missingProbe.readiness(signal, { includeProvider: true }),
        ).rejects.toMatchObject({ category: 'provider_unavailable' });
        await expect(missingProbe.readiness(signal)).resolves.toBeUndefined();
        expect(generate).not.toHaveBeenCalled();
    });

    it('does not invoke the provider when claim admission reports an open circuit', async () => {
        const generationStore = store({ claim: vi.fn(async () => null) });
        const generate = vi.fn(async () => proposal);
        const service = new DictionaryGenerationWorkerService(
            {
                clock: { now: () => new Date('2026-08-21T12:00:00.000Z') },
                provider: { generate },
                store: generationStore,
            },
            {
                heartbeatIntervalMs: 10,
                leaseDurationMs: 100,
                providerTimeoutMs: 50,
            },
        );

        await expect(
            service.processNext({
                signal: new AbortController().signal,
                supportedFormats: [dictionaryGenerationFormat],
                workerId: 'worker-a',
            }),
        ).resolves.toBe(false);
        expect(generate).not.toHaveBeenCalled();
    });

    it('preserves sanitized provider categories and rejects domain-invalid output without retry', async () => {
        const providerFailureStore = store();
        const providerFailure = new DictionaryGenerationWorkerService(
            {
                clock: { now: () => new Date('2026-08-21T12:00:00.000Z') },
                provider: {
                    generate: async () => {
                        throw new CardProposalGeneratorError(
                            'provider_rate_limited',
                        );
                    },
                },
                store: providerFailureStore,
            },
            {
                heartbeatIntervalMs: 10,
                leaseDurationMs: 100,
                providerTimeoutMs: 50,
            },
        );
        await providerFailure.processNext({
            signal: new AbortController().signal,
            supportedFormats: [dictionaryGenerationFormat],
            workerId: 'worker-a',
        });
        expect(providerFailureStore.fail).toHaveBeenCalledWith(
            expect.objectContaining({
                failureCategory: 'provider_rate_limited',
                retryAt: expect.any(Date),
            }),
        );

        const invalidStore = store({
            complete: vi.fn(async () => {
                throw new InvalidDictionarySettingsError(
                    'custom_label_required',
                );
            }),
        });
        const invalid = new DictionaryGenerationWorkerService(
            {
                clock: { now: () => new Date('2026-08-21T12:00:00.000Z') },
                provider: { generate: async () => proposal },
                store: invalidStore,
            },
            {
                heartbeatIntervalMs: 10,
                leaseDurationMs: 100,
                providerTimeoutMs: 50,
            },
        );
        await invalid.processNext({
            signal: new AbortController().signal,
            supportedFormats: [dictionaryGenerationFormat],
            workerId: 'worker-a',
        });
        expect(invalidStore.fail).toHaveBeenCalledWith(
            expect.objectContaining({
                failureCategory: 'invalid_model_output',
                retryAt: null,
            }),
        );
    });

    it('dispatches pasted terms in ordered chunks of twenty with stable keys and aggregate bounded usage', async () => {
        const rows = Array.from({ length: 41 }, (_, rowIndex) => ({
            input: `term ${rowIndex}`,
            rowIndex,
        }));
        const batchInput = {
            context: {
                dictionaryId: '00000000-0000-4000-8000-000000000002',
                expectedDictionaryVersion: 2,
                expectedSettingsVersion: 1,
                sourceLanguage: 'en',
                targetLanguage: 'fr',
            },
            effectiveSettings: input.original.effectiveSettings,
            format: dictionaryPastedTermsGenerationFormat,
            rows,
            sharedContext: 'Ecology',
        };
        const generationStore = store({
            claim: vi.fn(async () => ({
                attempt: 1,
                fencingToken: 1n,
                id: '00000000-0000-4000-8000-000000000004',
                input: batchInput,
                leaseDeadline: new Date('2026-08-21T12:00:00.100Z'),
                providerBudget: defaultDictionaryGenerationProviderBudgetPolicy,
                workerId: 'worker-a',
            })),
        });
        const generate = vi.fn(
            async (request: PastedTermsProposalGeneratorRequest) => {
                await new Promise((resolve) => setTimeout(resolve, 30));
                return {
                    proposal: {
                        candidates: request.input.rows
                            .filter((row) => row.rowIndex !== 20)
                            .map((row) => ({
                                candidate: proposal.candidate,
                                fieldFeedback: [],
                                input: row.input,
                                rowIndex: row.rowIndex,
                            })),
                        failures: request.input.rows
                            .filter((row) => row.rowIndex === 20)
                            .map((row) => ({
                                code: 'generation_failed' as const,
                                input: row.input,
                                message: 'Could not generate this row.',
                                retryable: true,
                                rowIndex: row.rowIndex,
                            })),
                        warnings: [],
                    },
                    usage: { inputTokens: 100, outputTokens: 50 },
                };
            },
        );
        const service = new DictionaryGenerationWorkerService(
            {
                clock: { now: () => new Date('2026-08-21T12:00:00.000Z') },
                pastedTermsProvider: { generate },
                provider: { generate: vi.fn() },
                store: generationStore,
            },
            {
                heartbeatIntervalMs: 10,
                leaseDurationMs: 100,
                pastedTermsProviderTimeoutMs: 200,
                providerTimeoutMs: 50,
            },
        );

        await expect(
            service.processNext({
                signal: new AbortController().signal,
                supportedFormats: [dictionaryPastedTermsGenerationFormat],
                workerId: 'worker-a',
            }),
        ).resolves.toBe(true);

        expect(generate).toHaveBeenCalledTimes(3);
        expect(
            generate.mock.calls.map(([request]) => request.idempotencyKey),
        ).toEqual([
            '00000000-0000-4000-8000-000000000004/generate/chunk/1-of-3',
            '00000000-0000-4000-8000-000000000004/generate/chunk/2-of-3',
            '00000000-0000-4000-8000-000000000004/generate/chunk/3-of-3',
        ]);
        expect(
            generate.mock.calls.map(([request]) => request.input.rows.length),
        ).toEqual([20, 20, 1]);
        expect(generationStore.complete).toHaveBeenCalledWith(
            expect.objectContaining({
                proposal: expect.objectContaining({
                    candidates: expect.arrayContaining([
                        expect.objectContaining({ rowIndex: 0 }),
                        expect.objectContaining({ rowIndex: 40 }),
                    ]),
                    failures: [expect.objectContaining({ rowIndex: 20 })],
                    warnings: [],
                }),
                providerUsage: { inputTokens: 300, outputTokens: 150 },
            }),
        );
    });

    it('dispatches trusted import pairs in bounded chunks without replacing baselines', async () => {
        const fingerprint =
            'hmac-sha256:v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
        const rows = Array.from({ length: 21 }, (_, offset) => ({
            lineage: {
                importFingerprint: fingerprint,
                importedRowIndex: offset + 100,
            },
            rowIndex: offset + 100,
            source: `source ${offset}`,
            translation: `translation ${offset}`,
        }));
        const generationStore = store({
            claim: vi.fn(async () => ({
                attempt: 1,
                fencingToken: 1n,
                id: '00000000-0000-4000-8000-000000000004',
                input: {
                    context: {
                        dictionaryId: '00000000-0000-4000-8000-000000000002',
                        expectedDictionaryVersion: 2,
                        expectedSettingsVersion: 1,
                        sourceLanguage: 'en',
                        targetLanguage: 'fr',
                    },
                    effectiveSettings: input.original.effectiveSettings,
                    format: dictionaryImportPairsGenerationFormat,
                    importFingerprint: fingerprint,
                    instruction: null,
                    rows,
                },
                leaseDeadline: new Date('2026-08-21T12:00:00.100Z'),
                providerBudget: defaultDictionaryGenerationProviderBudgetPolicy,
                workerId: 'worker-a',
            })),
        });
        const generate = vi.fn(
            async (request: ImportPairsProposalGeneratorRequest) => ({
                proposal: {
                    candidates: request.input.rows.map((row) => ({
                        candidate: {
                            ...proposal.candidate,
                            values: {
                                ...proposal.candidate.values,
                                source: row.source,
                                translation: row.translation,
                            },
                        },
                        fieldFeedback: [],
                        rowIndex: row.rowIndex,
                        source: row.source,
                        translation: row.translation,
                    })),
                    failures: [],
                    warnings: [],
                },
                usage: { inputTokens: 25, outputTokens: 10 },
            }),
        );
        const service = new DictionaryGenerationWorkerService(
            {
                clock: { now: () => new Date('2026-08-21T12:00:00.000Z') },
                importPairsProvider: { generate },
                provider: { generate: vi.fn() },
                store: generationStore,
            },
            {
                heartbeatIntervalMs: 10,
                leaseDurationMs: 100,
                pastedTermsProviderTimeoutMs: 200,
                providerTimeoutMs: 50,
            },
        );
        await expect(
            service.processNext({
                signal: new AbortController().signal,
                supportedFormats: [dictionaryImportPairsGenerationFormat],
                workerId: 'worker-a',
            }),
        ).resolves.toBe(true);
        expect(generate).toHaveBeenCalledTimes(2);
        expect(
            generate.mock.calls.map(([call]) => call.idempotencyKey),
        ).toEqual([
            '00000000-0000-4000-8000-000000000004/generate/import-chunk/1-of-2',
            '00000000-0000-4000-8000-000000000004/generate/import-chunk/2-of-2',
        ]);
        expect(generationStore.complete).toHaveBeenCalledWith(
            expect.objectContaining({
                proposal: expect.objectContaining({
                    candidates: expect.any(Array),
                }),
                providerUsage: { inputTokens: 50, outputTokens: 20 },
            }),
        );
    });

    it('aborts in-flight pasted-term chunks on shutdown without terminal failure', async () => {
        const batchInput = {
            context: {
                dictionaryId: '00000000-0000-4000-8000-000000000002',
                expectedDictionaryVersion: 2,
                expectedSettingsVersion: 1,
                sourceLanguage: 'en',
                targetLanguage: 'fr',
            },
            effectiveSettings: input.original.effectiveSettings,
            format: dictionaryPastedTermsGenerationFormat,
            rows: [{ input: 'bank', rowIndex: 0 }],
            sharedContext: null,
        };
        const generationStore = store({
            claim: vi.fn(async () => ({
                attempt: 1,
                fencingToken: 1n,
                id: '00000000-0000-4000-8000-000000000004',
                input: batchInput,
                leaseDeadline: new Date('2026-08-21T12:00:00.100Z'),
                providerBudget: defaultDictionaryGenerationProviderBudgetPolicy,
                workerId: 'worker-a',
            })),
        });
        const generate = vi.fn(
            ({ signal }: PastedTermsProposalGeneratorRequest) =>
                new Promise<never>((_resolve, reject) =>
                    signal.addEventListener(
                        'abort',
                        () => reject(signal.reason),
                        { once: true },
                    ),
                ),
        );
        const controller = new AbortController();
        const service = new DictionaryGenerationWorkerService(
            {
                clock: { now: () => new Date('2026-08-21T12:00:00.000Z') },
                pastedTermsProvider: { generate },
                provider: { generate: vi.fn() },
                store: generationStore,
            },
            {
                heartbeatIntervalMs: 10,
                leaseDurationMs: 100,
                pastedTermsProviderTimeoutMs: 200,
                providerTimeoutMs: 50,
            },
        );
        const processing = service.processNext({
            signal: controller.signal,
            supportedFormats: [dictionaryPastedTermsGenerationFormat],
            workerId: 'worker-a',
        });
        await vi.waitFor(() => expect(generate).toHaveBeenCalledOnce());
        controller.abort(new Error('shutdown'));

        await expect(processing).resolves.toBe(true);
        expect(generationStore.complete).not.toHaveBeenCalled();
        expect(generationStore.fail).not.toHaveBeenCalled();
    });

    it('stages document proposals for cleanup without using generic completion', async () => {
        const bytes = new TextEncoder().encode('bank\nshore');
        const object = {
            checksumSha256: createHash('sha256').update(bytes).digest('hex'),
            contentType: 'text/plain' as const,
            detectedFormat: 'txt',
            objectKey: 'documents/owner/upload',
            sizeBytes: bytes.byteLength,
            storageVersionId: 'version-1',
            uploadId: '00000000-0000-4000-8000-000000000005',
        };
        const documentInput = {
            context: {
                dictionaryId: '00000000-0000-4000-8000-000000000002',
                expectedDictionaryVersion: 2,
                expectedSettingsVersion: 1,
                sourceLanguage: 'en',
                targetLanguage: 'fr',
            },
            effectiveSettings: input.original.effectiveSettings,
            format: dictionaryDocumentGenerationFormat as 'document-terms:v1',
            instruction: null,
            uploadId: object.uploadId,
        };
        const generationStore = store({
            claim: vi.fn(async () => ({
                attempt: 1,
                fencingToken: 1n,
                id: '00000000-0000-4000-8000-000000000004',
                input: documentInput,
                leaseDeadline: new Date('2026-08-21T12:00:00.100Z'),
                providerBudget: defaultDictionaryGenerationProviderBudgetPolicy,
                workerId: 'worker-a',
            })),
        });
        const stageDocumentProposal = vi.fn(async () => true);
        const documentStore = {
            loadDocumentUploadForWorker: vi.fn(async () => object),
            stageDocumentProposal,
        } as unknown as DictionaryDocumentStore;
        const storage = new DeterministicPrivateDocumentStorage([
            { bytes, reference: object },
        ]);
        const processor = new DictionaryDocumentGenerationProcessor({
            clock: { now: () => new Date('2026-08-26T12:00:00.000Z') },
            extractor: new DeterministicSandboxedDocumentExtractor(),
            fingerprint: {
                fingerprint: () =>
                    'hmac-sha256:v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
            },
            ocr: new DeterministicDocumentOcrProvider(),
            proposalGenerator: new DeterministicPastedTermsProposalGenerator(),
            scanner: new DeterministicDocumentMalwareScanner(),
            storage,
        });
        const executor = new DictionaryDocumentGenerationExecutor({
            loadUpload: ({ fencingToken, jobId, signal, workerId }) =>
                documentStore.loadDocumentUploadForWorker({
                    context: {
                        now: new Date('2026-08-26T12:00:00.000Z'),
                        signal,
                    },
                    fencingToken,
                    jobId,
                    workerId,
                }),
            processor,
        });
        const service = new DictionaryGenerationWorkerService(
            {
                clock: { now: () => new Date('2026-08-26T12:00:00.000Z') },
                documentExecutor: executor,
                documentStore,
                provider: { generate: vi.fn() },
                store: generationStore,
            },
            {
                heartbeatIntervalMs: 10,
                leaseDurationMs: 100,
                pastedTermsProviderTimeoutMs: 200,
                providerTimeoutMs: 50,
            },
        );

        await service.processNext({
            signal: new AbortController().signal,
            supportedFormats: [dictionaryDocumentGenerationFormat],
            workerId: 'worker-a',
        });

        expect(stageDocumentProposal).toHaveBeenCalledWith(
            expect.objectContaining({
                failureUnitCount: 0,
                observedUnitCount: 2,
                providerUsage: { inputTokens: 0, outputTokens: 0 },
                validUnitCount: 2,
            }),
        );
        expect(generationStore.complete).not.toHaveBeenCalled();
    });

    it('persists clean scan evidence for terminal document processing failures', async () => {
        const documentInput = {
            context: {
                dictionaryId: '00000000-0000-4000-8000-000000000002',
                expectedDictionaryVersion: 2,
                expectedSettingsVersion: 1,
                sourceLanguage: 'en',
                targetLanguage: 'fr',
            },
            effectiveSettings: input.original.effectiveSettings,
            format: dictionaryDocumentGenerationFormat as 'document-terms:v1',
            instruction: null,
            uploadId: '00000000-0000-4000-8000-000000000005',
        };
        const generationStore = store({
            claim: vi.fn(async () => ({
                attempt: 1,
                fencingToken: 1n,
                id: '00000000-0000-4000-8000-000000000004',
                input: documentInput,
                leaseDeadline: new Date('2026-08-21T12:00:00.100Z'),
                providerBudget: defaultDictionaryGenerationProviderBudgetPolicy,
                workerId: 'worker-a',
            })),
        });
        const scanAttestation = {
            completedAt: new Date('2026-08-26T12:00:00.000Z'),
            engineVersion: 'scanner-1',
            signatureUpdatedAt: new Date('2026-08-26T11:00:00.000Z'),
            signatureVersion: 'signatures-1',
        };
        const recordDocumentProcessingFailure = vi.fn(async () => true);
        const documentStore = {
            recordDocumentProcessingFailure,
        } as unknown as DictionaryDocumentStore;
        const documentExecutor = {
            format: dictionaryDocumentGenerationFormat,
            execute: vi.fn(async () => {
                throw new DictionaryDocumentGenerationError(
                    'extraction_failed',
                    false,
                    undefined,
                    scanAttestation,
                );
            }),
        } as unknown as DictionaryDocumentGenerationExecutor;
        const service = new DictionaryGenerationWorkerService(
            {
                clock: { now: () => new Date('2026-08-26T12:00:00.000Z') },
                documentExecutor,
                documentStore,
                provider: { generate: vi.fn() },
                store: generationStore,
            },
            {
                heartbeatIntervalMs: 10,
                leaseDurationMs: 100,
                pastedTermsProviderTimeoutMs: 200,
                providerTimeoutMs: 50,
            },
        );

        await expect(
            service.processNext({
                signal: new AbortController().signal,
                supportedFormats: [dictionaryDocumentGenerationFormat],
                workerId: 'worker-a',
            }),
        ).resolves.toBe(true);

        expect(recordDocumentProcessingFailure).toHaveBeenCalledWith({
            category: 'extraction_failed',
            context: {
                now: new Date('2026-08-26T12:00:00.000Z'),
                signal: expect.any(AbortSignal),
            },
            fencingToken: 1n,
            jobId: '00000000-0000-4000-8000-000000000004',
            retryAt: null,
            scanAttestation,
            workerId: 'worker-a',
        });
        expect(generationStore.fail).not.toHaveBeenCalled();
    });
});
