import { describe, expect, it, vi } from 'vitest';
import { createDictionaryAudioAdapters } from '../../../../../src/modules/dictionaries/infrastructure/audio/dictionary-audio-adapters';
import {
    createFixtureAudio,
    audioChecksum,
} from '../../../../../src/modules/dictionaries/infrastructure/audio/audio-integrity';
import { loadDictionaryAudioEnvironment } from '../../../../../src/modules/dictionaries/infrastructure/audio/dictionary-audio-environment';
import {
    isPublicAudioAddress,
    validateAudioResultUrl,
    validateMp3,
} from '../../../../../src/modules/dictionaries/infrastructure/audio/safe-audio-download';
import {
    FixtureSpeechProvider,
    KieSpeechProvider,
} from '../../../../../src/modules/dictionaries/infrastructure/audio/speech-providers';
import { SpeechTaskFailedError } from '../../../../../src/modules/speech/application/ports/speech-synthesis-provider';

const profile = {
    configurationId: 'kie-v1',
    provider: 'kie',
    model: 'elevenlabs/text-to-speech-turbo-2-5',
    voice: 'Rachel',
    language: 'en',
    settingsVersion: '1',
    estimatedCostUnitsPerCharacter: 1,
};
const response = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status });
const provider = (
    fetcher: typeof fetch,
    download = vi.fn().mockResolvedValue(createFixtureAudio()),
) =>
    new KieSpeechProvider({
        configurationId: 'kie-v1',
        apiKey: 'fake',
        profiles: { en: profile },
        allowedDownloadHosts: ['cdn.example.com'],
        fetch: fetcher,
        download,
    });

describe('speech adapters', () => {
    it('restricts fixture languages consistently for API and worker while defaults support all', () => {
        const environment = loadDictionaryAudioEnvironment(
            {
                DICTIONARY_AUDIO_PROVIDER: 'fixture',
                SPEECH_FIXTURE_SUPPORTED_LANGUAGES: 'en, es, en',
            },
            { deployed: false },
        );
        for (const adapters of [
            createDictionaryAudioAdapters({
                environment,
                database: { execute: vi.fn() } as never,
                role: 'api',
            }),
            createDictionaryAudioAdapters({
                environment,
                database: { execute: vi.fn() } as never,
                role: 'worker',
            }),
        ]) {
            expect(adapters.provider.supports('en')).not.toBeNull();
            expect(adapters.provider.supports('es')).not.toBeNull();
            expect(adapters.provider.supports('he')).toBeNull();
            adapters.close();
        }
        const defaults = createDictionaryAudioAdapters({
            environment: loadDictionaryAudioEnvironment(
                {},
                { deployed: false },
            ),
            database: { execute: vi.fn() } as never,
        });
        expect(defaults.provider.supports('he')).not.toBeNull();
        defaults.close();
        expect(() =>
            loadDictionaryAudioEnvironment(
                { SPEECH_FIXTURE_SUPPORTED_LANGUAGES: 'en,,private-text' },
                { deployed: false },
            ),
        ).toThrow('Invalid test speech fixture language allowlist.');
        const live = loadDictionaryAudioEnvironment(
            {
                DICTIONARY_AUDIO_PROVIDER: 'kie',
                SPEECH_FIXTURE_SUPPORTED_LANGUAGES: 'invalid',
            },
            { deployed: false, role: 'api' },
        );
        expect(live.fixtureSupportedLanguages).toBeUndefined();
    });
    it('emits a genuine deterministic audible WAV fixture', async () => {
        const fixture = new FixtureSpeechProvider();
        const result = await fixture.submit({
            profile: fixture.supports('en'),
            text: 'fixture',
            requestId: 'request',
        });
        expect(result.state).toBe('ready');
        if (result.state !== 'ready') throw new Error('Missing fixture');
        const bytes = Buffer.from(result.audio.bytes);
        expect(bytes.toString('ascii', 0, 4)).toBe('RIFF');
        expect(bytes.toString('ascii', 8, 12)).toBe('WAVE');
        expect(bytes.readUInt32LE(40)).toBe(bytes.length - 44);
        expect(bytes.readInt16LE(1044)).not.toBe(0);
        expect(result.audio.checksum).toBe(
            audioChecksum(createFixtureAudio().bytes),
        );
    });
    it('holds ambiguous submission and never internally retries a paid call', async () => {
        for (const fetcher of [
            vi.fn().mockRejectedValue(new Error('timeout')),
            vi.fn().mockResolvedValue(response({ code: 200, data: {} })),
            vi.fn().mockResolvedValue(response({ code: 500 }, 500)),
        ]) {
            await expect(
                provider(fetcher).submit({
                    text: 'hello',
                    profile,
                    requestId: 'request',
                }),
            ).rejects.toMatchObject({ outcome: 'unknown', retryable: false });
            expect(fetcher).toHaveBeenCalledTimes(1);
        }
    });
    it('classifies explicit validation rejection as definitely not submitted', async () => {
        const fetcher = vi.fn().mockResolvedValue(response({ code: 422 }, 422));
        await expect(
            provider(fetcher).submit({
                text: 'hello',
                profile,
                requestId: 'request',
            }),
        ).rejects.toMatchObject({ outcome: 'not_submitted', retryable: false });
    });
    it('persists async identity and polls the original profile with no resubmission', async () => {
        const fetcher = vi
            .fn()
            .mockResolvedValueOnce(
                response({ code: 200, data: { taskId: 'task' } }),
            )
            .mockResolvedValueOnce(
                response({
                    code: 200,
                    data: {
                        taskId: 'task',
                        model: profile.model,
                        state: 'generating',
                    },
                }),
            )
            .mockResolvedValueOnce(
                response({
                    code: 200,
                    data: {
                        taskId: 'task',
                        model: profile.model,
                        state: 'success',
                        resultJson: JSON.stringify({
                            resultUrls: ['https://cdn.example.com/audio.mp3'],
                        }),
                    },
                }),
            );
        const download = vi.fn().mockResolvedValue(createFixtureAudio());
        const adapter = provider(fetcher, download);
        expect(
            await adapter.submit({
                text: 'hello',
                profile,
                requestId: 'request',
            }),
        ).toMatchObject({ state: 'pending', taskId: 'task' });
        expect(await adapter.poll({ taskId: 'task', profile })).toMatchObject({
            state: 'pending',
            taskId: 'task',
        });
        expect(await adapter.poll({ taskId: 'task', profile })).toMatchObject({
            state: 'ready',
        });
        expect(
            fetcher.mock.calls.filter(
                ([, options]) => options.method === 'POST',
            ),
        ).toHaveLength(1);
        expect(download).toHaveBeenCalledWith(
            'https://cdn.example.com/audio.mp3',
            ['cdn.example.com'],
            undefined,
        );
        expect(adapter.supports('uk')).toBeNull();
    });
    it('rejects mismatched task identity before downloading output', async () => {
        const fetcher = vi.fn().mockResolvedValue(
            response({
                code: 200,
                data: {
                    taskId: 'other',
                    model: profile.model,
                    state: 'success',
                },
            }),
        );
        await expect(
            provider(fetcher).poll({ taskId: 'task', profile }),
        ).rejects.toThrow('Mismatched');
    });
    it.each([429, '429', 500, '500', 502, '502', 503, '503', 504, '504'])(
        'classifies failed Kie task code %s as provider unavailability without retaining private diagnostics',
        async (failCode) => {
            const privateMessage =
                'synthetic confidential diagnostic https://invalid.example/private-output';
            const fetcher = vi.fn().mockResolvedValue(
                response({
                    code: 200,
                    data: {
                        taskId: 'task',
                        model: profile.model,
                        state: 'fail',
                        failCode,
                        failMsg: privateMessage,
                    },
                }),
            );
            const download = vi.fn();
            const error = await provider(fetcher, download)
                .poll({ taskId: 'task', profile })
                .catch((failure: unknown) => failure);
            expect(error).toBeInstanceOf(SpeechTaskFailedError);
            expect(error).toMatchObject({
                reason: 'provider_unavailable',
                message: 'Speech task failed.',
            });
            expect(JSON.stringify(error)).not.toContain(privateMessage);
            expect(error).not.toHaveProperty('failMsg');
            expect(download).not.toHaveBeenCalled();
            expect(fetcher).toHaveBeenCalledOnce();
            expect(fetcher.mock.calls[0]![1].method).toBe('GET');
        },
    );
    it.each([400, 'unknown', null, undefined])(
        'keeps failed Kie task code %s as a safe generic generation failure',
        async (failCode) => {
            const fetcher = vi.fn().mockResolvedValue(
                response({
                    code: 200,
                    data: {
                        taskId: 'task',
                        model: profile.model,
                        state: 'fail',
                        failCode,
                        failMsg: 'synthetic private provider diagnostic',
                    },
                }),
            );
            await expect(
                provider(fetcher).poll({ taskId: 'task', profile }),
            ).rejects.toMatchObject({
                reason: 'generation_failed',
                message: 'Speech task failed.',
            });
        },
    );
});

describe('audio download trust boundary', () => {
    it('rejects private, mapped, reserved and non-global addresses', () => {
        for (const value of [
            '127.0.0.1',
            '10.1.2.3',
            '169.254.169.254',
            '100.64.0.1',
            '192.168.1.2',
            '::1',
            '::ffff:127.0.0.1',
            'fc00::1',
            'fe80::1',
            '2001:db8::1',
            '2002:7f00:1::',
        ])
            expect(isPublicAudioAddress(value), value).toBe(false);
        expect(isPublicAudioAddress('8.8.8.8')).toBe(true);
        expect(isPublicAudioAddress('2606:4700:4700::1111')).toBe(true);
    });
    it('permits only credential-free HTTPS exact allowlisted hosts', () => {
        for (const value of [
            'http://cdn.example.com/a',
            'https://cdn.example.com.evil.test/a',
            'https://127.0.0.1/a',
            'https://user:secret@cdn.example.com/a',
            'https://cdn.example.com:444/a',
        ])
            expect(() =>
                validateAudioResultUrl(value, ['cdn.example.com']),
            ).toThrow();
        expect(
            validateAudioResultUrl('https://cdn.example.com/a?signature=fake', [
                'cdn.example.com',
            ]).hostname,
        ).toBe('cdn.example.com');
    });
    it('rejects non-audio and incomplete MP3 and enforces duration', () => {
        expect(() =>
            validateMp3(Buffer.from('<html>not audio</html>')),
        ).toThrow();
        const frame = Buffer.alloc(417);
        frame.set([255, 251, 144, 0]);
        expect(() => validateMp3(frame)).not.toThrow();
        expect(() => validateMp3(frame.subarray(0, 400))).toThrow();
        expect(() =>
            validateMp3(
                Buffer.concat(Array.from({ length: 5000 }, () => frame)),
            ),
        ).toThrow();
    });
});

describe('audio configuration', () => {
    it('resolves deployed API profiles without paid credentials or executable providers', () => {
        const values = {
            DICTIONARY_AUDIO_GENERATION_ENABLED: 'true',
            DICTIONARY_AUDIO_PROVIDER: 'kie',
            DICTIONARY_AUDIO_FINGERPRINT_SECRET:
                'fake-dedicated-fingerprint-secret-32',
            DICTIONARY_AUDIO_VOICE_MAP: JSON.stringify({
                en: {
                    model: profile.model,
                    voice: profile.voice,
                    estimatedCostUnitsPerCharacter: 1,
                },
            }),
            DICTIONARY_AUDIO_OWNER_BUDGET_UNITS: '100',
            DICTIONARY_AUDIO_GLOBAL_BUDGET_UNITS: '1000',
            DICTIONARY_AUDIO_STORAGE: 's3',
            DICTIONARY_AUDIO_S3_ENDPOINT: 'https://storage.example.com',
            DICTIONARY_AUDIO_S3_BUCKET: 'audio',
            DICTIONARY_AUDIO_S3_REGION: 'ru-1',
            DICTIONARY_AUDIO_S3_ACCESS_KEY_ID: 'fake-read',
            DICTIONARY_AUDIO_S3_SECRET_ACCESS_KEY: 'fake-read-secret',
        };
        const environment = loadDictionaryAudioEnvironment(values, {
            deployed: true,
            role: 'api',
        });
        expect(environment.apiKey).toBeUndefined();
        expect(environment.retainedConfigurations).toEqual([]);
        const adapters = createDictionaryAudioAdapters({
            environment,
            database: { execute: vi.fn() } as never,
            role: 'api',
        });
        try {
            expect(adapters.provider.supports('en')).toMatchObject({
                provider: 'kie',
                voice: profile.voice,
            });
            expect('submit' in adapters.provider).toBe(false);
            expect('poll' in adapters.provider).toBe(false);
            expect(adapters.providers.size).toBe(0);
            expect(() =>
                loadDictionaryAudioEnvironment(values, {
                    deployed: true,
                    role: 'worker',
                }),
            ).toThrow('credentials');
        } finally {
            adapters.close();
        }
    });
    it('drains an original task using retained credentials after switching defaults', async () => {
        const environment = loadDictionaryAudioEnvironment(
            {
                DICTIONARY_AUDIO_PROVIDER: 'kie',
                DICTIONARY_AUDIO_CONFIGURATION_ID: 'kie-new',
                DICTIONARY_AUDIO_KIE_API_KEY: 'new-secret',
                DICTIONARY_AUDIO_RETAINED_KIE_CONFIGURATIONS: JSON.stringify([
                    {
                        configurationId: 'kie-v1',
                        apiKey: 'original-secret',
                        allowedDownloadHosts: ['old.example.com'],
                    },
                ]),
            },
            { deployed: false },
        );
        const adapters = createDictionaryAudioAdapters({
            environment,
            database: { execute: vi.fn() } as never,
        });
        const fetcher = vi.fn().mockResolvedValue(
            response({
                code: 200,
                data: {
                    taskId: 'old-task',
                    model: profile.model,
                    state: 'generating',
                },
            }),
        );
        vi.stubGlobal('fetch', fetcher);
        try {
            expect(adapters.provider.configurationId).toBe('kie-new');
            const retained = adapters.providers.get('kie-v1')!;
            expect(retained.supports('en')).toBeNull();
            expect(
                await retained.poll({ taskId: 'old-task', profile }),
            ).toMatchObject({ taskId: 'old-task', state: 'pending' });
            expect(fetcher.mock.calls[0]![1].headers.authorization).toBe(
                'Bearer original-secret',
            );
            expect(fetcher.mock.calls[0]![0]).toContain('old-task');
        } finally {
            vi.unstubAllGlobals();
            adapters.close();
        }
    });
    it('rejects duplicate retained configuration identities', () => {
        expect(() =>
            loadDictionaryAudioEnvironment(
                {
                    DICTIONARY_AUDIO_PROVIDER: 'kie',
                    DICTIONARY_AUDIO_RETAINED_KIE_CONFIGURATIONS:
                        JSON.stringify([
                            {
                                configurationId: 'kie-v1',
                                apiKey: 'fake',
                                allowedDownloadHosts: ['old.example.com'],
                            },
                        ]),
                },
                { deployed: false },
            ),
        ).toThrow('unique');
    });
    it('defaults to disabled fixture/postgres and rejects deployed enabled fixtures', () => {
        expect(
            loadDictionaryAudioEnvironment({}, { deployed: false }),
        ).toMatchObject({
            provider: 'fixture',
            storage: 'postgres',
            playbackEnabled: false,
        });
        expect(() =>
            loadDictionaryAudioEnvironment(
                { DICTIONARY_AUDIO_PLAYBACK_ENABLED: 'true' },
                { deployed: true },
            ),
        ).toThrow();
    });
    it('requires explicit live voice map, allowed hosts and budgets', () => {
        expect(() =>
            loadDictionaryAudioEnvironment(
                {
                    DICTIONARY_AUDIO_PROVIDER: 'kie',
                    DICTIONARY_AUDIO_GENERATION_ENABLED: 'true',
                },
                { deployed: false },
            ),
        ).toThrow();
    });
});

describe('curated model strategies', () => {
    const gemini = {
        ...profile,
        configurationId: 'gemini-v1',
        model: 'google/gemini-3-8-flash-lite-tts',
        voice: 'Zephyr',
        settingsVersion: 'gemini-pronunciation-1',
        language: 'fr',
    };
    it.each([
        ['fr', 'French', 'alarmer'],
        ['tr', 'Turkish', 'merhaba'],
        ['ar', 'Arabic', 'مرحبا'],
        ['zh', 'Chinese (Simplified)', '你好'],
    ])(
        'uses a separate language instruction for %s without changing spoken text',
        async (language, name, text) => {
            const fetcher = vi
                .fn()
                .mockResolvedValue(
                    response({ code: 200, data: { taskId: 'tracked-task' } }),
                );
            const selected = { ...gemini, language };
            const adapter = new KieSpeechProvider({
                configurationId: selected.configurationId,
                apiKey: 'fake',
                profiles: { [language]: selected },
                allowedDownloadHosts: [],
                fetch: fetcher,
            });
            expect(
                await adapter.submit({
                    text,
                    profile: selected,
                    requestId: 'request',
                }),
            ).toMatchObject({ state: 'pending', taskId: 'tracked-task' });
            const body = JSON.parse(fetcher.mock.calls[0]![1].body);
            expect(body.model).toBe(gemini.model);
            expect(body.input).toEqual({
                temperature: 1,
                speakers: [{ speaker_id: 'Speaker 1', voice_name: 'Zephyr' }],
                dialogue_turns: [
                    {
                        speaker_id: 'Speaker 1',
                        text,
                        style: expect.stringContaining(name),
                    },
                ],
            });
            expect(fetcher).toHaveBeenCalledOnce();
        },
    );
    it('preserves pre-existing operator-versioned Turbo profiles and voice IDs for polling', async () => {
        const legacy = {
            ...profile,
            settingsVersion: 'bella-2026-10-14',
            voice: 'hpp4J3VqNfWAUOO0d1Us',
        };
        const fetcher = vi.fn().mockResolvedValue(
            response({
                code: 200,
                data: {
                    taskId: 'old-task',
                    model: profile.model,
                    state: 'generating',
                },
            }),
        );
        const adapter = provider(fetcher);
        expect(
            await adapter.poll({ taskId: 'old-task', profile: legacy }),
        ).toMatchObject({ state: 'pending' });
        expect(
            loadDictionaryAudioEnvironment(
                {
                    DICTIONARY_AUDIO_PROVIDER: 'kie',
                    DICTIONARY_AUDIO_VOICE_MAP: JSON.stringify({
                        en: {
                            model: legacy.model,
                            voice: legacy.voice,
                            settingsVersion: legacy.settingsVersion,
                            estimatedCostUnitsPerCharacter: 1,
                        },
                    }),
                },
                { deployed: false },
            ).profiles.en,
        ).toEqual(legacy);
    });
    it('keeps the original Turbo payload and settings exactly', async () => {
        const fetcher = vi
            .fn()
            .mockResolvedValue(
                response({ code: 200, data: { taskId: 'task' } }),
            );
        await provider(fetcher).submit({
            text: 'hello',
            profile,
            requestId: 'request',
        });
        expect(JSON.parse(fetcher.mock.calls[0]![1].body)).toEqual({
            model: profile.model,
            input: {
                text: 'hello',
                voice: 'Rachel',
                language_code: 'en',
                speed: 1,
                timestamps: false,
            },
        });
    });
    it.each([
        { language: 'hu' },
        { language: 'uk' },
        { voice: 'cloned-voice' },
        { settingsVersion: '1' },
        { model: 'arbitrary/model' },
        { configurationId: 'other' },
    ])(
        'rejects unsupported persisted Gemini profiles before HTTP: %j',
        async (override) => {
            const fetcher = vi.fn();
            const adapter = new KieSpeechProvider({
                configurationId: 'gemini-v1',
                apiKey: 'fake',
                profiles: {},
                allowedDownloadHosts: [],
                fetch: fetcher,
            });
            const selected = { ...gemini, ...override };
            await expect(
                adapter.submit({
                    text: 'alarmer',
                    profile: selected,
                    requestId: 'request',
                }),
            ).rejects.toMatchObject({ outcome: 'not_submitted' });
            await expect(
                adapter.poll({ taskId: 'task', profile: selected }),
            ).rejects.toThrow('Unsupported speech configuration');
            expect(fetcher).not.toHaveBeenCalled();
        },
    );
    it('polls retained Gemini profiles independently of current Turbo defaults and validates identity', async () => {
        const download = vi.fn().mockResolvedValue(createFixtureAudio());
        const fetcher = vi.fn().mockResolvedValue(
            response({
                code: 200,
                data: {
                    taskId: 'old-task',
                    model: gemini.model,
                    state: 'success',
                    resultJson: JSON.stringify({
                        resultUrls: ['https://cdn.example.com/audio.wav'],
                    }),
                },
            }),
        );
        const adapter = new KieSpeechProvider({
            configurationId: gemini.configurationId,
            apiKey: 'fake',
            profiles: {},
            allowedDownloadHosts: ['cdn.example.com'],
            fetch: fetcher,
            download,
        });
        expect(adapter.supports('fr')).toBeNull();
        expect(
            await adapter.poll({ taskId: 'old-task', profile: gemini }),
        ).toMatchObject({ state: 'ready' });
        expect(download).toHaveBeenCalledWith(
            'https://cdn.example.com/audio.wav',
            ['cdn.example.com'],
            undefined,
        );
        expect(fetcher.mock.calls[0]![1].method).toBe('GET');
        fetcher.mockResolvedValue(
            response({
                code: 200,
                data: {
                    taskId: 'old-task',
                    model: profile.model,
                    state: 'success',
                },
            }),
        );
        await expect(
            adapter.poll({ taskId: 'old-task', profile: gemini }),
        ).rejects.toThrow('Mismatched');
    });
    it('validates selected model language, voice, settings and rejects arbitrary synthesis options', () => {
        const values = (language: string, entry: unknown) => ({
            DICTIONARY_AUDIO_PROVIDER: 'kie',
            DICTIONARY_AUDIO_CONFIGURATION_ID: 'gemini-v1',
            DICTIONARY_AUDIO_VOICE_MAP: JSON.stringify({ [language]: entry }),
        });
        const entry = {
            model: gemini.model,
            voice: gemini.voice,
            estimatedCostUnitsPerCharacter: 1,
        };
        expect(
            loadDictionaryAudioEnvironment(values('fr', entry), {
                deployed: false,
            }).profiles.fr,
        ).toMatchObject(gemini);
        for (const [language, override] of [
            ['hu', {}],
            ['constructor', {}],
            ['fr', { model: 'arbitrary/model' }],
            ['fr', { voice: 'Bella' }],
            ['fr', { settingsVersion: '1' }],
            ['fr', { temperature: 2 }],
        ] as const)
            expect(() =>
                loadDictionaryAudioEnvironment(
                    values(language, { ...entry, ...override }),
                    { deployed: false },
                ),
            ).toThrow();
    });
    it('resolves the same Gemini language capabilities for metadata and executable providers without API credentials', () => {
        const environment = loadDictionaryAudioEnvironment(
            {
                DICTIONARY_AUDIO_PROVIDER: 'kie',
                DICTIONARY_AUDIO_CONFIGURATION_ID: 'gemini-v1',
                DICTIONARY_AUDIO_VOICE_MAP: JSON.stringify({
                    fr: {
                        model: gemini.model,
                        voice: 'Zephyr',
                        estimatedCostUnitsPerCharacter: 1,
                    },
                }),
            },
            { deployed: false, role: 'api' },
        );
        for (const role of ['api', 'worker'] as const) {
            const adapters = createDictionaryAudioAdapters({
                environment,
                database: { execute: vi.fn() } as never,
                role,
            } as never);
            expect(adapters.provider.supports('fr')).toEqual(gemini);
            expect(adapters.provider.supports('tr')).toBeNull();
            expect(adapters.provider.supports('constructor')).toBeNull();
            expect('submit' in adapters.provider).toBe(role === 'worker');
            adapters.close();
        }
    });
});
