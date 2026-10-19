import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import {
    createWorkerSentenceProvider,
    createWorkerTextsProvider,
    publishWorkerTextAiObservations,
    dictionaryWorkerLocalEnvironmentFile,
} from '../../../../src/infrastructure/worker/dictionary-worker-command';
import type { SentenceProviderCall } from '../../../../src/modules/learning/application/ports/sentence-ai-provider';
import type {
    SentenceGenerationInput,
    SentenceCheckInput,
} from '../../../../src/modules/learning/domain/sentence-types';

const { publishObservation } = vi.hoisted(() => ({
    publishObservation: vi.fn(async (_options: Record<string, unknown>) => {}),
}));
vi.mock(
    '../../../../src/modules/text-ai/infrastructure/ai/text-ai-worker-observations',
    () => ({ publishTextAiWorkerObservations: publishObservation }),
);

describe('dictionary worker command', () => {
    it('the live command advertises preparation on initial publication and refresh', async () => {
        const environment = {
            providerFixtureMode: 'off' as const,
            supportedFormats: ['sentence-generation:v2'],
            providerCredentials: {},
            readinessTimeoutMs: 100,
        };
        const database = {} as Parameters<
            typeof publishWorkerTextAiObservations
        >[1];
        await publishWorkerTextAiObservations(environment, database, 'worker');
        await publishWorkerTextAiObservations(environment, database, 'worker');
        expect(publishObservation).toHaveBeenCalledTimes(2);
        for (const [options] of publishObservation.mock.calls)
            expect(options).toMatchObject({
                learningExecutionEnabled: true,
                textsCapacityEnabled: true,
                textsExecutionEnabled: true,
                sentencePreparationExecutionEnabled: true,
                supportedFormats: ['sentence-generation:v2'],
            });
    });
    it('resolves the shared repository local environment file', () => {
        expect(fileURLToPath(dictionaryWorkerLocalEnvironmentFile)).toMatch(
            /\/languon\/\.env\.local$/,
        );
    });
    it('fails closed for sentence calls under dictionary-only deterministic fixtures', async () => {
        const provider = createWorkerSentenceProvider({
            providerFixtureMode: 'deterministic',
            providerCredentials: { DEEPSEEK_API_KEY: 'fake-local-credential' },
        });
        // Empty calls prove the fixture mode never reaches a model adapter or
        // credential resolver, irrespective of the configured credential.
        await expect(
            provider.generate(
                {} as SentenceProviderCall<SentenceGenerationInput>,
            ),
        ).rejects.toThrow('Sentence provider fixtures are unavailable.');
        await expect(
            provider.check({} as SentenceProviderCall<SentenceCheckInput>),
        ).rejects.toThrow('Sentence provider fixtures are unavailable.');
    });
});

it('uses synthetic local translation without invoking the provider or dropping sentence identities', async () => {
    const provider = createWorkerTextsProvider({
        providerFixtureMode: 'deterministic',
        providerCredentials: {},
    });
    const result = await provider.run({
        input: {
            kind: 'text-translation',
            sourceText: 'Hello.',
            targetLanguage: 'fr',
            segments: [{ pairId: 'pair', text: 'Hello.' }],
        },
        signal: new AbortController().signal,
    } as never);
    expect(result).toEqual({
        draft: { translation: [{ pairId: 'pair', text: '[fr] Hello.' }] },
        usage: { inputTokens: 1, outputTokens: 1 },
    });
});

it('publishes conversation execution only for configured live worker support', async () => {
    publishObservation.mockClear();
    const database = {} as Parameters<
        typeof publishWorkerTextAiObservations
    >[1];
    await publishWorkerTextAiObservations(
        {
            providerFixtureMode: 'off',
            supportedFormats: ['conversation:v1'],
            providerCredentials: {},
            readinessTimeoutMs: 100,
        },
        database,
        'live',
    );
    await publishWorkerTextAiObservations(
        {
            providerFixtureMode: 'deterministic',
            supportedFormats: ['conversation:v1'],
            providerCredentials: {},
            readinessTimeoutMs: 100,
        },
        database,
        'fixture',
    );
    expect(publishObservation.mock.calls[0]?.[0]).toMatchObject({
        conversationCapacityEnabled: true,
        conversationExecutionEnabled: true,
    });
    expect(publishObservation.mock.calls[1]?.[0]).toMatchObject({
        conversationCapacityEnabled: true,
        conversationExecutionEnabled: false,
    });
});
