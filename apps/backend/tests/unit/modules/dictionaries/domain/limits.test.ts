import { describe, expect, it } from 'vitest';

import {
    assertDictionaryOwnerCapacity,
    DictionaryOwnerCapacityError,
    dictionaryLimits,
    type InvalidDictionaryTextError,
    normalizeCardValues,
    normalizeDictionaryDetails,
} from '../../../../../src/modules/dictionaries/domain/limits';

describe('dictionary text limits', () => {
    it('trims dictionary details and card values while preserving inactive values', () => {
        expect(
            normalizeDictionaryDetails({
                description: '  A personal list  ',
                name: '  German nouns  ',
            }),
        ).toEqual({
            description: 'A personal list',
            name: 'German nouns',
        });
        expect(
            normalizeCardValues({
                definition: ' dormant definition ',
                example: '',
                exampleTranslation: null,
                source: ' Haus ',
                transcription: ' haʊs ',
                translation: ' house ',
            }),
        ).toEqual({
            definition: 'dormant definition',
            example: null,
            exampleTranslation: null,
            source: 'Haus',
            transcription: 'haʊs',
            translation: 'house',
        });
    });

    it('counts Unicode code points and rejects blank required values', () => {
        const exactLimit = '😀'.repeat(dictionaryLimits.nameCodePoints);

        expect(
            normalizeDictionaryDetails({ description: null, name: exactLimit }),
        ).toEqual({ description: null, name: exactLimit });
        expect(() =>
            normalizeDictionaryDetails({
                description: null,
                name: `${exactLimit}😀`,
            }),
        ).toThrowError(
            expect.objectContaining<Partial<InvalidDictionaryTextError>>({
                field: 'dictionary_name',
                reason: 'too_long',
            }),
        );
        expect(() =>
            normalizeCardValues({
                definition: null,
                example: null,
                exampleTranslation: null,
                source: '   ',
                transcription: null,
                translation: 'house',
            }),
        ).toThrowError(
            expect.objectContaining<Partial<InvalidDictionaryTextError>>({
                field: 'source',
                reason: 'blank',
            }),
        );
    });

    it('rejects unsafe control characters but permits ordinary multiline text', () => {
        expect(
            normalizeDictionaryDetails({
                description: 'line one\nline two',
                name: 'Safe',
            }).description,
        ).toBe('line one\nline two');
        expect(() =>
            normalizeDictionaryDetails({
                description: 'unsafe\u0000text',
                name: 'Safe',
            }),
        ).toThrowError(
            expect.objectContaining<Partial<InvalidDictionaryTextError>>({
                reason: 'control_character',
            }),
        );
    });

    it('enforces the documented retained owner budgets at their exact boundaries', () => {
        expect(() =>
            assertDictionaryOwnerCapacity(
                {
                    cards: dictionaryLimits.ownerRetainedCardCapacity,
                    dictionaries: dictionaryLimits.ownerDictionaryCapacity,
                    revisions: dictionaryLimits.ownerRevisionCapacity,
                },
                { cards: 0, dictionaries: 0, revisions: 0 },
            ),
        ).not.toThrow();
        expect(() =>
            assertDictionaryOwnerCapacity(
                {
                    cards: 0,
                    dictionaries: dictionaryLimits.ownerDictionaryCapacity,
                    revisions: 0,
                },
                { cards: 0, dictionaries: 1, revisions: 0 },
            ),
        ).toThrowError(
            expect.objectContaining<Partial<DictionaryOwnerCapacityError>>({
                resource: 'dictionaries',
            }),
        );
        expect(() =>
            assertDictionaryOwnerCapacity(
                {
                    cards: dictionaryLimits.ownerRetainedCardCapacity,
                    dictionaries: 0,
                    revisions: 0,
                },
                { cards: 1, dictionaries: 0, revisions: 0 },
            ),
        ).toThrowError(
            expect.objectContaining<Partial<DictionaryOwnerCapacityError>>({
                resource: 'cards',
            }),
        );
        expect(() =>
            assertDictionaryOwnerCapacity(
                {
                    cards: 0,
                    dictionaries: 0,
                    revisions: dictionaryLimits.ownerRevisionCapacity,
                },
                { cards: 0, dictionaries: 0, revisions: 1 },
            ),
        ).toThrowError(DictionaryOwnerCapacityError);
    });
});
