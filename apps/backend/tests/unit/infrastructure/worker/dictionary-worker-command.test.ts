import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
    createWorkerSentenceProvider,
    dictionaryWorkerLocalEnvironmentFile,
} from '../../../../src/infrastructure/worker/dictionary-worker-command';
import type { SentenceProviderCall } from '../../../../src/modules/learning/application/ports/sentence-ai-provider';
import type {
    SentenceGenerationInput,
    SentenceCheckInput,
} from '../../../../src/modules/learning/domain/sentence-types';

describe('dictionary worker command', () => {
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
