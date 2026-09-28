import type { DictionaryCard, OwnedDictionary } from '@languon/contracts';
import { describe, expect, it, vi } from 'vitest';

import { DictionaryAudioService } from '../../../../../src/modules/dictionaries/application/dictionary-audio-service';
import { createFixtureAudio } from '../../../../../src/modules/dictionaries/infrastructure/audio/audio-integrity';

const now = new Date('2026-09-21T12:00:00.000Z');
const dictionaryId = '11111111-1111-4111-8111-111111111111';
const cardId = '22222222-2222-4222-8222-222222222222';

function dictionary(): OwnedDictionary {
    return {
        id: dictionaryId,
        name: 'Words',
        description: null,
        translationContext: null,
        sourceLanguage: 'en',
        targetLanguage: 'uk',
        visibility: 'private',
        lifecycle: 'active',
        activeCardCount: 1,
        languagePairLocked: true,
        version: 1,
        settingsVersion: 1,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        archivedAt: null,
        sourceDictionaryId: null,
        settings: {
            version: 1,
            updatedAt: now.toISOString(),
            values: {
                transcriptionEnabled: false,
                transcriptionNotation: 'ipa',
                transcriptionCustomLabel: null,
                definitionEnabled: false,
                definitionLanguage: 'source',
                exampleEnabled: true,
                exampleLanguage: 'source',
                exampleTranslationEnabled: true,
            },
        },
    };
}

function card(source = 'bank'): DictionaryCard {
    return {
        id: cardId,
        dictionaryId,
        authorship: 'human',
        lifecycle: 'active',
        position: 'a',
        version: 3,
        settingsVersion: 1,
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
        archivedAt: null,
        translationContext: null,
        values: {
            source,
            translation: 'банк',
            transcription: null,
            definition: null,
            example: null,
            exampleTranslation: null,
        },
        overrides: {
            transcriptionEnabled: null,
            transcriptionNotation: null,
            transcriptionCustomLabel: null,
            definitionEnabled: null,
            definitionLanguage: null,
            exampleEnabled: null,
            exampleLanguage: null,
            exampleTranslationEnabled: null,
        },
        effectiveSettings: {
            transcriptionEnabled: false,
            transcriptionNotation: 'ipa',
            transcriptionCustomLabel: null,
            definitionEnabled: false,
            definitionLanguage: 'source',
            exampleEnabled: true,
            exampleLanguage: 'source',
            exampleTranslationEnabled: true,
            exampleTranslationLanguage: 'target',
        },
    };
}

function setup(input: { existing?: unknown; cards?: DictionaryCard[] } = {}) {
    const readCard = vi.fn().mockImplementation(async () => ({
        card: input.cards?.shift() ?? card(),
    }));
    const store = {
        find: vi.fn().mockResolvedValue(input.existing ?? null),
        enqueue: vi.fn(),
    };
    const provider = {
        supports: vi.fn(() => ({
            configurationId: 'new-default',
            provider: 'kie',
            model: 'model',
            voice: 'voice',
            language: 'en',
            settingsVersion: '2',
            estimatedCostUnitsPerCharacter: 1,
        })),
    };
    const storage = {
        identity: { backend: 'postgres' as const, namespace: 'test' },
        read: vi.fn(),
    };
    const rateLimiter = {
        consume: vi.fn().mockResolvedValue({ allowed: true }),
    };
    const service = new DictionaryAudioService({
        rateLimiter,
        authentication: {
            authenticate: vi.fn().mockResolvedValue({ userId: 'owner' }),
        },
        dictionaries: {
            readDictionary: vi.fn().mockResolvedValue(dictionary()),
            readCard,
        } as never,
        store: store as never,
        storage: storage as never,
        provider: provider as never,
        fingerprintSecret: 'test-secret',
        clock: { now: () => now },
        budget: {
            ownerDailyCost: 100,
            globalDailyCost: 100,
            ownerQueued: 2,
            ownerActive: 1,
            globalActive: 2,
        },
        playbackEnabled: true,
        generationEnabled: true,
    });
    return { service, store, provider, storage, readCard, rateLimiter };
}

const request = {
    field: 'source' as const,
    expectedCardVersion: 3,
    expectedSettingsVersion: 1,
};
const context = { signal: new AbortController().signal };

describe('DictionaryAudioService cache and read authorization', () => {
    it('rejects throttled request, status and byte calls before dictionary/store/provider access', async () => {
        const { service, store, provider, storage, readCard, rateLimiter } =
            setup();
        rateLimiter.consume.mockResolvedValue({
            allowed: false,
            retryAfterSeconds: 10,
        });
        await expect(
            service.request('token', dictionaryId, cardId, request, context),
        ).rejects.toMatchObject({ retryAfterSeconds: 10 });
        await expect(
            service.status('token', dictionaryId, cardId, 'source', context),
        ).rejects.toMatchObject({ retryAfterSeconds: 10 });
        await expect(
            service.content(
                'token',
                dictionaryId,
                cardId,
                'source',
                cardId,
                context,
            ),
        ).rejects.toMatchObject({ retryAfterSeconds: 10 });
        expect(readCard).not.toHaveBeenCalled();
        expect(store.find).not.toHaveBeenCalled();
        expect(provider.supports).not.toHaveBeenCalled();
        expect(storage.read).not.toHaveBeenCalled();
    });

    it('bounds simultaneous object reads and releases capacity when a read fails', async () => {
        const audio = createFixtureAudio();
        const existing = {
            job: { state: 'ready' },
            asset: {
                id: cardId,
                state: 'ready',
                checksum: audio.checksum,
                storage: {
                    backend: 'postgres',
                    namespace: 'test',
                    key: 'dictionary-audio/owner/a',
                },
            },
        };
        const { service, storage } = setup({ existing });
        let release!: () => void;
        const held = new Promise<void>((resolve) => {
            release = resolve;
        });
        storage.read.mockImplementation(async () => {
            await held;
            throw new Error('storage unavailable');
        });
        const reads = Array.from({ length: 4 }, () =>
            service
                .content(
                    'token',
                    dictionaryId,
                    cardId,
                    'source',
                    cardId,
                    context,
                )
                .catch(() => null),
        );
        await vi.waitFor(() => expect(storage.read).toHaveBeenCalledTimes(4));
        await expect(
            service.content(
                'token',
                dictionaryId,
                cardId,
                'source',
                cardId,
                context,
            ),
        ).rejects.toMatchObject({ retryAfterSeconds: 1 });
        expect(storage.read).toHaveBeenCalledTimes(4);
        release();
        await Promise.all(reads);
        storage.read.mockResolvedValue(audio);
        await expect(
            service.content(
                'token',
                dictionaryId,
                cardId,
                'source',
                cardId,
                context,
            ),
        ).resolves.toMatchObject({ checksum: audio.checksum });
    });
    it('returns a valid cached rendition before consulting a changed provider default', async () => {
        const existing = {
            job: {
                state: 'ready',
                assetId: '33333333-3333-4333-8333-333333333333',
                profile: { provider: 'fixture' },
                deadlineAt: now,
                error: null,
            },
            asset: { state: 'ready' },
        };
        const { service, store, provider } = setup({ existing });

        await expect(
            service.request('token', dictionaryId, cardId, request, context),
        ).resolves.toMatchObject({
            state: 'ready',
            fixture: true,
            assetId: existing.job.assetId,
        });
        expect(provider.supports).not.toHaveBeenCalled();
        expect(store.enqueue).not.toHaveBeenCalled();
    });

    it('keeps a timed-out known task bound and does not submit another paid job on repeat play', async () => {
        const existing = {
            job: {
                state: 'waiting_provider',
                assetId: '33333333-3333-4333-8333-333333333333',
                profile: { provider: 'kie' },
                deadlineAt: new Date(now.getTime() - 1),
                error: null,
            },
            asset: { state: 'pending' },
        };
        const { service, store, provider } = setup({ existing });

        await expect(
            service.request('token', dictionaryId, cardId, request, context),
        ).resolves.toMatchObject({
            state: 'failed',
            error: 'generation_timeout',
        });
        await expect(
            service.request('token', dictionaryId, cardId, request, context),
        ).resolves.toMatchObject({
            state: 'failed',
            error: 'generation_timeout',
        });
        expect(provider.supports).not.toHaveBeenCalled();
        expect(store.enqueue).not.toHaveBeenCalled();
    });

    it('rejects bytes when the card changes while the private object is being read', async () => {
        const audio = createFixtureAudio();
        const existing = {
            job: {
                state: 'ready',
                assetId: '33333333-3333-4333-8333-333333333333',
                profile: { provider: 'fixture' },
                deadlineAt: now,
                error: null,
            },
            asset: {
                id: '33333333-3333-4333-8333-333333333333',
                state: 'ready',
                storage: {
                    backend: 'postgres',
                    namespace: 'test',
                    key: 'dictionary-audio/owner/a',
                },
                checksum: audio.checksum,
            },
        };
        const { service, storage, readCard } = setup({
            existing,
            cards: [card('bank'), card('shore')],
        });
        storage.read.mockResolvedValue(audio);

        await expect(
            service.content(
                'token',
                dictionaryId,
                cardId,
                'source',
                existing.job.assetId,
                context,
            ),
        ).rejects.toThrow();
        expect(readCard).toHaveBeenCalledTimes(2);
    });
});
