import { describe, expect, it } from 'vitest';
import {
    CopyKnowledgeVocabularyRequestSchema,
    CopyKnowledgeTextRequestSchema,
    KnowledgeTextLibraryPreviewSchema,
} from './knowledge-library-copy';
const id = '00000000-0000-4000-8000-000000000001';
const source = { operationId: id, noteId: id, noteVersion: 1, blockId: id };
describe('knowledge library publication contracts', () => {
    it('previews untranslated Text drafts without fabricated sentence pairs', () => {
        expect(
            KnowledgeTextLibraryPreviewSchema.parse({
                isNew: true,
                text: {
                    title: 'Copied source',
                    sourceLanguage: 'en',
                    targetLanguage: 'ru',
                    sourceText: 'A source passage.',
                    alignment: null,
                },
            }).text.alignment,
        ).toBeNull();
    });
    it('accepts prepared-entry selections but never client content or actor grants', () => {
        const input = {
            ...source,
            entryIds: [id],
            destination: {
                kind: 'new',
                name: 'Words',
                sourceLanguage: 'en',
                targetLanguage: 'ru',
            },
        };
        expect(
            CopyKnowledgeVocabularyRequestSchema.safeParse(input).success,
        ).toBe(true);
        expect(
            CopyKnowledgeVocabularyRequestSchema.safeParse({
                ...input,
                entries: [{ term: 'Forged' }],
            }).success,
        ).toBe(false);
        expect(
            CopyKnowledgeVocabularyRequestSchema.safeParse({
                ...input,
                actorId: id,
            }).success,
        ).toBe(false);
    });
    it('requires unique entries and explicit source/destination versions', () => {
        const input = {
            ...source,
            entryIds: [id, id],
            destination: {
                kind: 'existing',
                dictionaryId: id,
                expectedDictionaryVersion: 1,
                expectedSettingsVersion: 1,
            },
        };
        expect(
            CopyKnowledgeVocabularyRequestSchema.safeParse(input).success,
        ).toBe(false);
        expect(
            CopyKnowledgeVocabularyRequestSchema.safeParse({
                ...input,
                entryIds: [id],
                destination: { kind: 'existing', dictionaryId: id },
            }).success,
        ).toBe(false);
    });
    it('accepts only server-resolved text and explicit target translation', () => {
        const input = {
            ...source,
            translationLanguage: 'ru',
            destination: { kind: 'existing', textId: id, expectedVersion: 1 },
        };
        expect(CopyKnowledgeTextRequestSchema.parse(input)).toEqual(input);
        expect(
            CopyKnowledgeTextRequestSchema.safeParse({
                ...input,
                alignment: { source: [] },
            }).success,
        ).toBe(false);
        expect(
            CopyKnowledgeTextRequestSchema.safeParse({
                ...input,
                noteVersion: 0,
            }).success,
        ).toBe(false);
    });
});
