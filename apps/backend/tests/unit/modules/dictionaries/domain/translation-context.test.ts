import { describe, expect, it } from 'vitest';

import type { InvalidDictionaryTextError } from '../../../../../src/modules/dictionaries/domain/limits';
import { dictionaryLimits } from '../../../../../src/modules/dictionaries/domain/limits';
import {
    normalizeTranslationContext,
    resolveTranslationContext,
} from '../../../../../src/modules/dictionaries/domain/translation-context';
import { DictionaryCardRevisionSnapshotSchema } from '../../../../../src/modules/dictionaries/infrastructure/persistence/drizzle/revision-snapshot-schema';

const legacySnapshot = {
    authorship: 'human' as const,
    cardVersion: 1,
    effectiveSettings: {
        customNotationLabel: null,
        definitionEnabled: false,
        definitionLanguageRole: 'source' as const,
        exampleEnabled: true,
        exampleLanguageRole: 'source' as const,
        exampleTranslationEnabled: true,
        exampleTranslationLanguageRole: 'target' as const,
        transcriptionEnabled: false,
        transcriptionNotation: 'ipa' as const,
    },
    rawOverrides: {
        customNotationLabel: null,
        definitionEnabled: null,
        definitionLanguageRole: null,
        exampleEnabled: null,
        exampleLanguageRole: null,
        exampleTranslationEnabled: null,
        transcriptionEnabled: null,
        transcriptionNotation: null,
    },
    schemaVersion: 1 as const,
    settingsVersion: 1,
    values: {
        definition: null,
        example: null,
        exampleTranslation: null,
        source: 'bank',
        transcription: null,
        translation: 'banco',
    },
};

describe('dictionary translation context', () => {
    it('normalizes optional multiline context and enforces its code-point bound', () => {
        expect(
            normalizeTranslationContext('  legal\ncontract language  '),
        ).toBe('legal\ncontract language');
        expect(normalizeTranslationContext('   ')).toBeNull();
        expect(normalizeTranslationContext(null)).toBeNull();

        const exactLimit = '😀'.repeat(
            dictionaryLimits.translationContextCodePoints,
        );
        expect(normalizeTranslationContext(exactLimit)).toBe(exactLimit);
        expect(() =>
            normalizeTranslationContext(`${exactLimit}😀`),
        ).toThrowError(
            expect.objectContaining<Partial<InvalidDictionaryTextError>>({
                field: 'translation_context',
                reason: 'too_long',
            }),
        );
    });

    it('resolves a card override before dictionary context and otherwise null', () => {
        expect(
            resolveTranslationContext({
                card: 'medical sense',
                dictionary: 'travel vocabulary',
            }),
        ).toBe('medical sense');
        expect(
            resolveTranslationContext({
                card: null,
                dictionary: 'travel vocabulary',
            }),
        ).toBe('travel vocabulary');
        expect(
            resolveTranslationContext({ card: null, dictionary: null }),
        ).toBeNull();
    });

    it('continues parsing legacy revisions and requires context snapshots in v2', () => {
        expect(
            DictionaryCardRevisionSnapshotSchema.parse(legacySnapshot),
        ).toEqual(legacySnapshot);
        expect(
            DictionaryCardRevisionSnapshotSchema.parse({
                ...legacySnapshot,
                effectiveTranslationContext: 'finance',
                rawTranslationContext: null,
                schemaVersion: 2,
            }),
        ).toMatchObject({
            effectiveTranslationContext: 'finance',
            rawTranslationContext: null,
            schemaVersion: 2,
        });
        expect(() =>
            DictionaryCardRevisionSnapshotSchema.parse({
                ...legacySnapshot,
                schemaVersion: 2,
            }),
        ).toThrow();
    });
});
