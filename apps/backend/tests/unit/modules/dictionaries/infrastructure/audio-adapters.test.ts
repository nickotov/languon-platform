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
