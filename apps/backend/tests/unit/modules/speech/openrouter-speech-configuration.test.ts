import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadDictionaryAudioEnvironment } from '../../../../src/config/environment';
import { createDictionaryAudioAdapters } from '../../../../src/modules/speech/infrastructure/audio/dictionary-audio-adapters';
import {
    OPENROUTER_ELEVEN_TURBO_MODEL,
    OPENROUTER_ELEVEN_SETTINGS_VERSION,
    findSpeechModel,
} from '../../../../src/modules/speech/domain/speech-models';
import { SUPPORTED_LANGUAGE_TAGS } from '@languon/languages';

const values = {
    DICTIONARY_AUDIO_PROVIDER: 'openrouter',
    DICTIONARY_AUDIO_CONFIGURATION_ID: 'openrouter-eleven-george-v1',
    SPEECH_GENERATION_ENABLED: 'true',
    OPENROUTER_API_KEY: 'synthetic-inference-key',
    DICTIONARY_AUDIO_VOICE_MAP: JSON.stringify({
        fr: {
            model: OPENROUTER_ELEVEN_TURBO_MODEL,
            voice: 'george',
            settingsVersion: OPENROUTER_ELEVEN_SETTINGS_VERSION,
            estimatedCostUnitsPerCharacter: 0.04,
        },
    }),
    DICTIONARY_AUDIO_OWNER_BUDGET_UNITS: '1000',
    DICTIONARY_AUDIO_GLOBAL_BUDGET_UNITS: '10000',
};
afterEach(() => vi.restoreAllMocks());
describe('OpenRouter speech configuration', () => {
    it('uses the existing key only in workers and exposes metadata-only API adapters', () => {
        const api = loadDictionaryAudioEnvironment(values, {
            deployed: false,
            role: 'api',
        });
        const worker = loadDictionaryAudioEnvironment(values, {
            deployed: false,
            role: 'worker',
        });
        expect(api.apiKey).toBeUndefined();
        expect(worker.apiKey).toBe(values.OPENROUTER_API_KEY);
        const adapters = createDictionaryAudioAdapters({
            environment: api,
            database: { execute: vi.fn() } as never,
            role: 'api',
        });
        try {
            expect(adapters.provider.supports('fr')).toMatchObject({
                provider: 'openrouter',
                model: OPENROUTER_ELEVEN_TURBO_MODEL,
                voice: 'george',
            });
            expect(adapters.provider.supports('tr')).toBeNull();
            expect('submit' in adapters.provider).toBe(false);
            expect(adapters.providers.size).toBe(0);
        } finally {
            adapters.close();
        }
    });
    it('requires a worker credential while allowing API metadata without one', () => {
        const noKey = { ...values, OPENROUTER_API_KEY: undefined };
        expect(() =>
            loadDictionaryAudioEnvironment(noKey, {
                deployed: false,
                role: 'worker',
            }),
        ).toThrow('credentials');
        expect(
            loadDictionaryAudioEnvironment(noKey, {
                deployed: false,
                role: 'api',
            }).profiles.fr,
        ).toBeDefined();
    });
    it('warns when the bounded timeout fallback is used and honors explicit values', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(
            loadDictionaryAudioEnvironment(values, { deployed: false })
                .requestTimeoutMs,
        ).toBe(45000);
        expect(
            warn.mock.calls.some(([message]) =>
                String(message).includes(
                    'DICTIONARY_AUDIO_OPENROUTER_TIMEOUT_MS',
                ),
            ),
        ).toBe(true);
        expect(warn.mock.calls.flat().join(' ')).not.toContain(
            'synthetic-inference-key',
        );
        expect(
            loadDictionaryAudioEnvironment(
                { ...values, DICTIONARY_AUDIO_OPENROUTER_TIMEOUT_MS: '20000' },
                { deployed: false },
            ).requestTimeoutMs,
        ).toBe(20000);
    });
    it.each(['0', '-1', '45001', 'abc'])(
        'rejects an invalid or lease-unsafe timeout %s',
        (timeout) => {
            vi.spyOn(console, 'error').mockImplementation(() => {});
            expect(() =>
                loadDictionaryAudioEnvironment(
                    {
                        ...values,
                        DICTIONARY_AUDIO_OPENROUTER_TIMEOUT_MS: timeout,
                    },
                    { deployed: false },
                ),
            ).toThrow();
        },
    );
    it('maps every supported app language explicitly without opening arbitrary voices', () => {
        const model = findSpeechModel(
            'openrouter',
            OPENROUTER_ELEVEN_TURBO_MODEL,
        )!;
        expect(Object.keys(model.languageCodes).sort()).toEqual(
            [...SUPPORTED_LANGUAGE_TAGS].sort(),
        );
        expect(model.maxCharacters).toBe(2000);
        expect(() =>
            loadDictionaryAudioEnvironment(
                {
                    ...values,
                    DICTIONARY_AUDIO_VOICE_MAP: JSON.stringify({
                        fr: {
                            model: model.modelId,
                            voice: 'unreviewed-clone-id',
                            estimatedCostUnitsPerCharacter: 1,
                        },
                    }),
                },
                { deployed: false },
            ),
        ).toThrow('Unsupported curated');
    });
});
