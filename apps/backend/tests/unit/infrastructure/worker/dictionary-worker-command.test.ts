import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import {
    createWorkerSentenceProvider,
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
