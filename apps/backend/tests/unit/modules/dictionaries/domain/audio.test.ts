import type { DictionaryCard, OwnedDictionary } from '@languon/contracts';
import { describe, expect, it } from 'vitest';

import { resolveDictionaryAudio } from '../../../../../src/modules/dictionaries/domain/audio';

function dictionary(): OwnedDictionary {
    return {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Words',
        description: null,
        sourceLanguage: 'en',
        targetLanguage: 'uk',
        visibility: 'private',
        lifecycle: 'active',
        activeCardCount: 1,
        languagePairLocked: true,
        version: 1,
        settingsVersion: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        archivedAt: null,
        sourceDictionaryId: null,
        settings: {
            version: 1,
            updatedAt: '2026-01-01T00:00:00.000Z',
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

function card(): DictionaryCard {
    return {
        id: '22222222-2222-4222-8222-222222222222',
        dictionaryId: '11111111-1111-4111-8111-111111111111',
        authorship: 'human',
        lifecycle: 'active',
        position: 'a',
        version: 1,
        settingsVersion: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        archivedAt: null,
        values: {
            source: 'bank',
            translation: 'банк',
            transcription: null,
            definition: null,
            example: 'The bank is closed.',
            exampleTranslation: 'Банк зачинено.',
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

describe('dictionary pronunciation audio resolution', () => {
    it('maps source, translation, and both example roles to dictionary languages', () => {
        const ownedDictionary = dictionary();
        const activeCard = card();

        expect(
            resolveDictionaryAudio(ownedDictionary, activeCard, 'source'),
        ).toEqual({ text: 'bank', language: 'en' });
        expect(
            resolveDictionaryAudio(ownedDictionary, activeCard, 'translation'),
        ).toEqual({ text: 'банк', language: 'uk' });
        expect(
            resolveDictionaryAudio(ownedDictionary, activeCard, 'example'),
        ).toEqual({ text: 'The bank is closed.', language: 'en' });
        expect(
            resolveDictionaryAudio(
                ownedDictionary,
                activeCard,
                'exampleTranslation',
            ),
        ).toEqual({ text: 'Банк зачинено.', language: 'uk' });
    });

    it('uses the effective example roles when a card reverses its example language', () => {
        const activeCard = card();
        activeCard.effectiveSettings.exampleLanguage = 'target';
        activeCard.effectiveSettings.exampleTranslationLanguage = 'source';

        expect(
            resolveDictionaryAudio(dictionary(), activeCard, 'example'),
        ).toMatchObject({ language: 'uk' });
        expect(
            resolveDictionaryAudio(
                dictionary(),
                activeCard,
                'exampleTranslation',
            ),
        ).toMatchObject({ language: 'en' });
    });

    it('withholds optional, blank, oversized, and archived content', () => {
        const activeCard = card();
        activeCard.effectiveSettings.exampleEnabled = false;
        expect(
            resolveDictionaryAudio(dictionary(), activeCard, 'example'),
        ).toBeNull();

        activeCard.effectiveSettings.exampleEnabled = true;
        activeCard.effectiveSettings.exampleTranslationEnabled = false;
        expect(
            resolveDictionaryAudio(
                dictionary(),
                activeCard,
                'exampleTranslation',
            ),
        ).toBeNull();

        activeCard.values.source = '   ';
        expect(
            resolveDictionaryAudio(dictionary(), activeCard, 'source'),
        ).toBeNull();

        activeCard.values.source = '😀'.repeat(2_000);
        expect(
            resolveDictionaryAudio(dictionary(), activeCard, 'source'),
        ).toMatchObject({ language: 'en' });
        activeCard.values.source = '😀'.repeat(2_001);
        expect(
            resolveDictionaryAudio(dictionary(), activeCard, 'source'),
        ).toBeNull();

        activeCard.values.source = 'bank';
        activeCard.lifecycle = 'archived';
        expect(
            resolveDictionaryAudio(dictionary(), activeCard, 'source'),
        ).toBeNull();
        expect(
            resolveDictionaryAudio(
                { ...dictionary(), lifecycle: 'archived' },
                card(),
                'source',
            ),
        ).toBeNull();
    });
});
