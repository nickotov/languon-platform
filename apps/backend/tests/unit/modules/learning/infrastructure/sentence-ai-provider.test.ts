import { describe, it, expect, vi } from 'vitest';
const generate = vi.hoisted(() => vi.fn());
const agentOptions = vi.hoisted(() => vi.fn());
const registerPrimitives = vi.hoisted(() => vi.fn());
vi.mock('@mastra/core/agent', () => ({
    Agent: class {
        constructor(options: unknown) {
            agentOptions(options);
        }
        generate = generate;
        __registerPrimitives = registerPrimitives;
    },
}));
import { noopLogger } from '@mastra/core/logger';
import { createSentenceAiProvider } from '../../../../../src/modules/learning/infrastructure/ai/sentence-ai-provider';
import { SentenceWorkerService } from '../../../../../src/modules/learning/application/sentence-worker-service';
import type {
    ClaimedSentenceJob,
    SentenceWorkerStore,
} from '../../../../../src/modules/learning/application/ports/sentence-worker-store';
import { textAiModelCatalog } from '../../../../../src/modules/text-ai/application/text-ai-provider-catalog';
import { SentenceInvalidModelOutputError } from '../../../../../src/modules/learning/domain/sentence-errors';
const model = textAiModelCatalog[0]!;
const execution = {
    adapterRevision: model.adapterRevision,
    aggregateBudget: model.aggregateBudget,
    credentialReference: model.credentialReference,
    creditPricing: model.creditPricing,
    enabledModelIds: [model.id],
    modelId: model.id,
    perCallMaxInputTokens: model.perCallMaxInputTokens,
    perCallMaxOutputTokens: model.perCallMaxOutputTokens,
    providerId: model.providerId,
    supportedFormats: ['sentence-generation:v1'],
};
const call = {
    execution,
    budget: model.aggregateBudget,
    idempotencyKey: 'synthetic-generation:1',
    signal: new AbortController().signal,
    input: {
        schemaVersion: 1 as const,
        generationPolicyVersion: 1 as const,
        dictionaryId: 'dictionary',
        direction: 'source-to-target' as const,
        sourceLanguage: 'en' as const,
        targetLanguage: 'de' as const,
        priorityEntryId: '00000000-0000-4000-8000-000000000001',
        candidates: [
            {
                entryId: '00000000-0000-4000-8000-000000000001',
                learningVersion: 5,
                sourceText: 'go',
                targetText: 'gehen',
            },
        ],
    },
};
const draft = {
    sourceText: 'Go.',
    referenceTranslation: 'Geh.',
    segments: [
        { text: 'Go.', entryId: '00000000-0000-4000-8000-000000000001' },
    ],
    targets: [
        {
            entryId: '00000000-0000-4000-8000-000000000001',
            normalizedHint: 'gehen',
            hintForm: 'infinitive',
        },
    ],
};
const providerDraft = {
    ...draft,
    segments: draft.segments.map((segment) => ({
        ...segment,
        entryId: 'candidate-1',
    })),
    targets: draft.targets.map((target) => ({
        ...target,
        entryId: 'candidate-1',
    })),
};
describe('sentence structured provider boundary', () => {
    it('requires v2 contextual hint dispositions without exposing dictionary IDs', async () => {
        const contextualDraft = {
            ...providerDraft,
            sourceText: 'Go home.',
            referenceTranslation: 'Geh nach Hause.',
            segments: [
                { text: 'Go', entryId: 'candidate-1', contextualHint: null },
                { text: ' ', entryId: null, contextualHint: null },
                {
                    text: 'home',
                    entryId: null,
                    contextualHint: {
                        normalizedHint: 'nach Hause',
                        hintForm: 'phrase',
                    },
                },
                { text: '.', entryId: null, contextualHint: null },
            ],
        };
        generate.mockResolvedValue({ object: contextualDraft });
        const provider = createSentenceAiProvider({
            credentials: { DEEPSEEK_API_KEY: 'synthetic-test-key' },
        });
        const result = await provider.generate({
            ...call,
            input: { ...call.input, generationPolicyVersion: 2 },
        });
        expect(result.draft.segments[2]?.contextualHint).toEqual({
            normalizedHint: 'nach Hause',
            hintForm: 'phrase',
        });
        expect(
            JSON.parse(generate.mock.calls.at(-1)?.[0] as string)
                .generationPolicyVersion,
        ).toBe(2);
        generate.mockResolvedValue({ object: providerDraft });
        await expect(
            provider.generate({
                ...call,
                input: { ...call.input, generationPolicyVersion: 2 },
            }),
        ).rejects.toBeInstanceOf(SentenceInvalidModelOutputError);
    });
    it('hides private input/output, prohibits tools and pins bounded single-attempt SDK options', async () => {
        generate.mockResolvedValue({
            object: providerDraft,
            usage: { inputTokens: 12, outputTokens: 18 },
        });
        const provider = createSentenceAiProvider({
            credentials: { DEEPSEEK_API_KEY: 'synthetic-test-key' },
        });
        expect(await provider.generate(call)).toEqual({
            draft,
            usage: { inputTokens: 12, outputTokens: 18 },
        });
        expect(generate.mock.calls.at(-1)?.[1]).toMatchObject({
            runId: call.idempotencyKey,
            toolChoice: 'none',
            tracingOptions: { hideInput: true, hideOutput: true },
            modelSettings: { maxRetries: 0 },
        });
    });

    it('projects generation to request-local aliases and excludes all persistent identifiers and versions', async () => {
        generate.mockResolvedValue({ object: providerDraft });
        const provider = createSentenceAiProvider({
            credentials: { DEEPSEEK_API_KEY: 'synthetic-test-key' },
        });
        const result = await provider.generate(call);
        const message = generate.mock.calls.at(-1)?.[0] as string;
        expect(message).not.toContain(call.input.dictionaryId);
        expect(message).not.toContain(call.input.priorityEntryId);
        expect(message).not.toContain('learningVersion');
        expect(message).not.toContain('schemaVersion');
        expect(JSON.parse(message).candidates).toEqual([
            { entryId: 'candidate-1', sourceText: 'go', targetText: 'gehen' },
        ]);
        expect(JSON.parse(message).priorityEntryId).toBe('candidate-1');
        expect(result.draft.targets[0]?.entryId).toBe(
            call.input.priorityEntryId,
        );
    });
    it('projects checks to local aliases while preserving the exact answer and bounded grading context', async () => {
        const checkInput = {
            schemaVersion: 1 as const,
            exerciseId: '00000000-0000-4000-8000-000000000002',
            sourceText: 'Go.',
            referenceTranslation: 'Geh.',
            sourceLanguage: 'en' as const,
            targetLanguage: 'de' as const,
            targets: call.input.candidates,
            answer: '  Geh!  ',
            explanationLanguage: 'en' as const,
            revealedHintIds: ['hint-1'],
        };
        const checkDraft = {
            proposedPercentage: 100,
            meaning: 'correct',
            grammar: 'correct',
            targets: {
                'target-1': {
                    status: 'used',
                    explanation: 'Correct vocabulary.',
                },
            },
            issues: [],
            improvedTranslation: 'Geh!',
            explanation: 'Correct.',
        };
        generate.mockResolvedValue({ object: checkDraft });
        const provider = createSentenceAiProvider({
            credentials: { DEEPSEEK_API_KEY: 'synthetic-test-key' },
        });
        const result = await provider.check({ ...call, input: checkInput });
        const message = generate.mock.calls.at(-1)?.[0] as string;
        expect(message).not.toContain(checkInput.exerciseId);
        expect(message).not.toContain(call.input.priorityEntryId);
        expect(message).not.toContain('learningVersion');
        expect(JSON.parse(message)).toMatchObject({
            answer: '  Geh!  ',
            sourceText: 'Go.',
            referenceTranslation: 'Geh.',
            hintsRevealed: true,
        });
        expect(result.draft.targets[0]?.entryId).toBe(
            call.input.priorityEntryId,
        );
        generate.mockResolvedValue({
            object: {
                ...checkDraft,
                targets: { 'target-99': checkDraft.targets['target-1'] },
            },
        });
        await expect(
            provider.check({ ...call, input: checkInput }),
        ).rejects.toBeInstanceOf(SentenceInvalidModelOutputError);
    });
    it('rejects generation output containing unrecognized local aliases or persistent IDs', async () => {
        const provider = createSentenceAiProvider({
            credentials: { DEEPSEEK_API_KEY: 'synthetic-test-key' },
        });
        generate.mockResolvedValue({
            object: {
                ...providerDraft,
                targets: [
                    {
                        ...providerDraft.targets[0],
                        entryId: call.input.priorityEntryId,
                    },
                ],
            },
        });
        await expect(provider.generate(call)).rejects.toBeInstanceOf(
            SentenceInvalidModelOutputError,
        );
        generate.mockResolvedValue({
            object: {
                ...providerDraft,
                segments: [{ text: 'Go.', entryId: 'candidate-99' }],
            },
        });
        await expect(provider.generate(call)).rejects.toBeInstanceOf(
            SentenceInvalidModelOutputError,
        );
    });
    it('rejects malformed structured output and invalid reported token usage', async () => {
        const provider = createSentenceAiProvider({
            credentials: { DEEPSEEK_API_KEY: 'synthetic-test-key' },
        });
        generate.mockResolvedValueOnce({
            object: { ...providerDraft, unexpected: 'private' },
        });
        await expect(provider.generate(call)).rejects.toMatchObject({
            reason: 'schema_invalid',
        });
        generate.mockResolvedValueOnce({
            object: providerDraft,
            usage: { inputTokens: -1, outputTokens: 18 },
        });
        await expect(provider.generate(call)).rejects.toMatchObject({
            reason: 'usage_invalid',
        });
    });
    const checkInput = {
        schemaVersion: 1 as const,
        exerciseId: '00000000-0000-4000-8000-000000000002',
        sourceText: 'Go.',
        referenceTranslation: 'Geh.',
        sourceLanguage: 'en' as const,
        targetLanguage: 'de' as const,
        targets: call.input.candidates,
        answer: '  café e\u0301 😀!  ',
        explanationLanguage: 'en' as const,
        revealedHintIds: [],
    };
    const assessment = { status: 'used', explanation: 'Correct.' };
    const checkOutput = {
        proposedPercentage: 100,
        meaning: 'correct',
        grammar: 'correct',
        targets: { 'target-1': assessment },
        issues: [],
        improvedTranslation: 'Geh.',
        explanation: 'Correct.',
    };
    it.each([2, 3])(
        'requires and projects every one of %i keyed target assessments in input order',
        async (count) => {
            const targets = Array.from({ length: count }, (_, index) => ({
                ...call.input.candidates[0]!,
                entryId: `00000000-0000-4000-8000-00000000000${index + 1}`,
            }));
            generate.mockResolvedValue({
                object: {
                    ...checkOutput,
                    targets: Object.fromEntries(
                        targets
                            .map((_, index) => [
                                `target-${index + 1}`,
                                assessment,
                            ])
                            .reverse(),
                    ),
                },
            });
            const provider = createSentenceAiProvider({
                credentials: { DEEPSEEK_API_KEY: 'synthetic-test-key' },
            });
            const result = await provider.check({
                ...call,
                input: { ...checkInput, targets },
            });
            expect(
                result.draft.targets.map((target) => target.entryId),
            ).toEqual(targets.map((target) => target.entryId));
            const schema =
                generate.mock.calls.at(-1)?.[1].structuredOutput.schema;
            expect(
                schema.safeParse({
                    ...checkOutput,
                    targets: { 'target-1': assessment },
                }).success,
            ).toBe(false);
        },
    );
    it.each([
        {},
        { 'target-1': assessment, 'target-2': assessment },
        [{ entryId: 'target-1', ...assessment }],
    ])(
        'rejects missing, extra or legacy-array assessments with a safe reason',
        async (targets) => {
            generate.mockResolvedValue({ object: { ...checkOutput, targets } });
            const provider = createSentenceAiProvider({
                credentials: { DEEPSEEK_API_KEY: 'synthetic-test-key' },
            });
            await expect(
                provider.check({ ...call, input: checkInput }),
            ).rejects.toMatchObject({ reason: 'target_assessments_invalid' });
        },
    );
    it.each([
        ['café', { start: 2, end: 6, quote: 'café' }],
        ['e\u0301', { start: 7, end: 9, quote: 'e\u0301' }],
        ['😀', { start: 10, end: 12, quote: '😀' }],
        ['  café', { start: 0, end: 6, quote: '  café' }],
        ['e', null],
        ['missing', null],
        [null, null],
    ])(
        'resolves an exact issue quote %j without trusting model offsets',
        async (quote, span) => {
            generate.mockResolvedValue({
                object: {
                    ...checkOutput,
                    issues: [
                        {
                            kind: 'grammar',
                            severity: 'minor',
                            quote,
                            explanation: 'Review this.',
                            correction: null,
                        },
                    ],
                },
            });
            const provider = createSentenceAiProvider({
                credentials: { DEEPSEEK_API_KEY: 'synthetic-test-key' },
            });
            const result = await provider.check({ ...call, input: checkInput });
            expect(result.draft.issues[0]).toEqual({
                kind: 'grammar',
                severity: 'minor',
                span,
                explanation: 'Review this.',
                correction: null,
            });
            expect(result.draft.proposedPercentage).toBe(100);
        },
    );
    it('rejects model-authored offsets while accepting non-positioned feedback for ambiguous quotes', async () => {
        const provider = createSentenceAiProvider({
            credentials: { DEEPSEEK_API_KEY: 'synthetic-test-key' },
        });
        const issue = {
            kind: 'grammar',
            severity: 'minor',
            quote: 'one',
            explanation: 'Review.',
            correction: null,
        };
        generate.mockResolvedValue({
            object: {
                ...checkOutput,
                issues: [
                    { ...issue, span: { start: 0, end: 3, quote: 'one' } },
                ],
            },
        });
        await expect(
            provider.check({
                ...call,
                input: { ...checkInput, answer: 'one one' },
            }),
        ).rejects.toMatchObject({ reason: 'schema_invalid' });
        generate.mockResolvedValue({
            object: { ...checkOutput, issues: [issue] },
        });
        const result = await provider.check({
            ...call,
            input: { ...checkInput, answer: 'one one' },
        });
        expect(result.draft.issues[0]?.span).toBeNull();
        expect(result.draft.issues[0]?.explanation).toBe('Review.');
    });
    it('rejects duplicate input identities before contacting the provider', async () => {
        generate.mockClear();
        const provider = createSentenceAiProvider({
            credentials: { DEEPSEEK_API_KEY: 'synthetic-test-key' },
        });
        await expect(
            provider.check({
                ...call,
                input: {
                    ...checkInput,
                    targets: [...checkInput.targets, ...checkInput.targets],
                },
            }),
        ).rejects.toMatchObject({ reason: 'input_invalid' });
        expect(generate).not.toHaveBeenCalled();
    });
    it.each([
        [
            'missing assessment',
            {
                object: { ...checkOutput, targets: { 'target-1': assessment } },
                usage: { inputTokens: 12, outputTokens: 18 },
            },
            'target_assessments_invalid',
            { inputTokens: 12, outputTokens: 18 },
        ],
        [
            'negative usage',
            {
                object: checkOutput,
                usage: { inputTokens: -1, outputTokens: 18 },
            },
            'usage_invalid',
            undefined,
        ],
        [
            'out-of-bounds usage',
            {
                object: checkOutput,
                usage: {
                    inputTokens: Number.MAX_SAFE_INTEGER,
                    outputTokens: 18,
                },
            },
            'usage_invalid',
            undefined,
        ],
        [
            'SDK structured rejection',
            {
                tripwire: {
                    processorId: 'structured-output',
                    message: 'Private response',
                },
                usage: { inputTokens: 12, outputTokens: 18 },
            },
            'schema_invalid',
            { inputTokens: 12, outputTokens: 18 },
        ],
    ])(
        'settles %s through the real provider and worker without raw-content telemetry or check retry',
        async (_label, response, reason, usage) => {
            generate.mockClear();
            generate.mockResolvedValue(response);
            const now = new Date('2026-10-06T10:00:00Z');
            const job: ClaimedSentenceJob = {
                kind: 'sentence-check',
                format: 'sentence-check:v1',
                lease: {
                    jobId: 'job',
                    workerId: 'worker',
                    attempt: 1,
                    fencingToken: 1,
                },
                leaseDeadline: new Date(now.getTime() + 30000),
                providerIdempotencyKey: 'synthetic-check:1',
                execution,
                budget: model.aggregateBudget,
                input: {
                    ...checkInput,
                    targets: [
                        ...checkInput.targets,
                        {
                            ...checkInput.targets[0]!,
                            entryId: '00000000-0000-4000-8000-000000000003',
                        },
                    ],
                },
            };
            const store = {
                claimNext: vi.fn<SentenceWorkerStore['claimNext']>(
                    async () => job,
                ),
                markDispatched: vi.fn<SentenceWorkerStore['markDispatched']>(
                    async () => 'dispatch',
                ),
                heartbeat: vi.fn<SentenceWorkerStore['heartbeat']>(),
                completeCheck: vi.fn<SentenceWorkerStore['completeCheck']>(),
                completeGeneration:
                    vi.fn<SentenceWorkerStore['completeGeneration']>(),
                fail: vi.fn<SentenceWorkerStore['fail']>(),
                releaseWorkerLeases:
                    vi.fn<SentenceWorkerStore['releaseWorkerLeases']>(),
            };
            const onInvalidModelOutput = vi.fn();
            const service = new SentenceWorkerService({
                store,
                provider: createSentenceAiProvider({
                    credentials: { DEEPSEEK_API_KEY: 'synthetic-test-key' },
                }),
                clock: { now: () => now },
                workerId: 'worker',
                leaseMs: 30000,
                heartbeatMs: 10000,
                timeoutMs: 2000,
                globalConcurrency: 2,
                learnerConcurrency: 1,
                maxAttempts: 3,
                retryDelayMs: 1000,
                onInvalidModelOutput,
            });
            await service.processNext(new AbortController().signal);
            expect(store.fail).toHaveBeenCalledWith(
                job.lease,
                {
                    code: 'invalid_model_output',
                    retryAt: null,
                    ...(usage ? { usage } : {}),
                },
                { now, signal: expect.any(AbortSignal) },
            );
            expect(store.completeCheck).not.toHaveBeenCalled();
            expect(onInvalidModelOutput.mock.calls).toEqual([
                [{ kind: 'sentence-check', reason }],
            ]);
            expect(generate).toHaveBeenCalledOnce();
            expect(agentOptions.mock.calls.at(-1)?.[0]).not.toHaveProperty(
                'logger',
            );
            expect(registerPrimitives.mock.calls.at(-1)?.[0].logger).toBe(
                noopLogger,
            );
        },
    );
    it('keeps unrelated SDK tripwires classified as provider availability failures', async () => {
        generate.mockResolvedValue({
            tripwire: {
                processorId: 'other-processor',
                message: 'Private response',
            },
            usage: { inputTokens: 12, outputTokens: 18 },
        });
        const provider = createSentenceAiProvider({
            credentials: { DEEPSEEK_API_KEY: 'synthetic-test-key' },
        });
        await expect(
            provider.check({ ...call, input: checkInput }),
        ).rejects.toThrow('Sentence provider unavailable');
    });
    it.each([
        [
            { inputTokens: 12, outputTokens: 18 },
            'schema_invalid',
            { inputTokens: 12, outputTokens: 18 },
        ],
        [{ inputTokens: -1, outputTokens: 18 }, 'usage_invalid', undefined],
        [
            { inputTokens: 12, outputTokens: Number.MAX_SAFE_INTEGER },
            'usage_invalid',
            undefined,
        ],
    ])(
        'classifies a native SDK structured-output exception with sanitized usage %j',
        async (usage, reason, retainedUsage) => {
            const error = Object.assign(
                new Error('Private raw model output.'),
                { name: 'AI_NoObjectGeneratedError', usage },
            );
            generate.mockRejectedValue(error);
            const provider = createSentenceAiProvider({
                credentials: { DEEPSEEK_API_KEY: 'synthetic-test-key' },
            });
            const rejected = await provider
                .check({ ...call, input: checkInput })
                .catch((cause: unknown) => cause);
            expect(rejected).toBeInstanceOf(SentenceInvalidModelOutputError);
            expect(rejected).toMatchObject({ reason });
            expect((rejected as { usage?: unknown }).usage).toEqual(
                retainedUsage,
            );
            expect((rejected as Error).message).not.toContain('Private raw');
        },
    );
    it('preserves unknown SDK exception handling without accepting its alleged usage', async () => {
        const error = Object.assign(new Error('Unknown provider failure'), {
            name: 'UnrecognizedSdkError',
            usage: { inputTokens: 12, outputTokens: 18 },
        });
        generate.mockRejectedValue(error);
        const provider = createSentenceAiProvider({
            credentials: { DEEPSEEK_API_KEY: 'synthetic-test-key' },
        });
        await expect(
            provider.check({ ...call, input: checkInput }),
        ).rejects.toBe(error);
    });
});
