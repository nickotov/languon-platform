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

describe('owned working library source authority', () => {
    const working = {
        operationId: id,
        noteId: id,
        blockId: id,
        workingSource: { branchId: id, expectedVersion: 2 },
        translationLanguage: 'ru',
        destination: { kind: 'new', title: 'Working copy' },
    };
    it('requires exactly one explicit saved or working snapshot without accepting content', () => {
        expect(CopyKnowledgeTextRequestSchema.safeParse(working).success).toBe(
            true,
        );
        expect(
            CopyKnowledgeTextRequestSchema.safeParse({
                ...working,
                noteVersion: 1,
            }).success,
        ).toBe(false);
        expect(
            CopyKnowledgeTextRequestSchema.safeParse({
                ...working,
                workingSource: undefined,
            }).success,
        ).toBe(false);
        expect(
            CopyKnowledgeTextRequestSchema.safeParse({
                ...working,
                workingSource: { branchId: id, expectedVersion: 0 },
            }).success,
        ).toBe(false);
        expect(
            CopyKnowledgeTextRequestSchema.safeParse({
                ...working,
                block: { sourceText: 'forged' },
            }).success,
        ).toBe(false);
    });
    it('keeps private reader translation receipts bound to saved material', () => {
        expect(
            CopyKnowledgeTextRequestSchema.safeParse({
                ...working,
                privateTranslation: {
                    sourceFingerprint: 'a'.repeat(64),
                    updatedAt: '2026-10-29T00:00:00.000Z',
                },
            }).success,
        ).toBe(false);
    });
});
