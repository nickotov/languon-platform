import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SpeechSourceSchema, type LearningBlock } from '@languon/contracts';
import { knowledgeSnippetText } from '../../../../src/modules/speech/domain/knowledge-snippet-text';

describe('Knowledge snippet speech', () => {
    const entryId = randomUUID();
    const vocabulary: LearningBlock = {
        id: randomUUID(),
        type: 'vocabulary',
        language: 'fr',
        translationLanguage: 'ru',
        entries: [
            {
                id: entryId,
                term: 'travail',
                translation: 'работа',
                example: 'Je vais au travail.',
            },
        ],
    };
    it('speaks only the selected source term or example in its prepared language', () => {
        expect(
            knowledgeSnippetText(vocabulary, {
                kind: 'vocabulary',
                entryId,
                field: 'term',
            }),
        ).toEqual({ text: 'travail', language: 'fr' });
        expect(
            knowledgeSnippetText(vocabulary, {
                kind: 'vocabulary',
                entryId,
                field: 'example',
            }),
        ).toEqual({ text: 'Je vais au travail.', language: 'fr' });
        expect(() =>
            knowledgeSnippetText(vocabulary, {
                kind: 'vocabulary',
                entryId: randomUUID(),
                field: 'term',
            }),
        ).toThrow();
        expect(() =>
            knowledgeSnippetText(vocabulary, {
                kind: 'grammar-example',
                index: 0,
            }),
        ).toThrow();
    });
    it('selects a source bilingual segment or complete source without adding translations', () => {
        const segmentId = randomUUID();
        const block: LearningBlock = {
            id: randomUUID(),
            type: 'bilingual-text',
            language: 'fr',
            segments: [
                { id: segmentId, text: 'Bonjour.' },
                { id: randomUUID(), text: 'Au revoir.' },
            ],
            translations: [],
        };
        expect(
            knowledgeSnippetText(block, { kind: 'bilingual', segmentId }),
        ).toEqual({ text: 'Bonjour.', language: 'fr' });
        expect(knowledgeSnippetText(block, { kind: 'bilingual' })).toEqual({
            text: 'Bonjour.\n\nAu revoir.',
            language: 'fr',
        });
    });
    it('selects only an existing grammar source example', () => {
        const block: LearningBlock = {
            id: randomUUID(),
            type: 'grammar',
            language: 'fr',
            examples: [{ text: 'Je travaille.', translation: 'Я работаю.' }],
        };
        expect(
            knowledgeSnippetText(block, { kind: 'grammar-example', index: 0 }),
        ).toEqual({ text: 'Je travaille.', language: 'fr' });
        expect(() =>
            knowledgeSnippetText(block, { kind: 'grammar-example', index: 1 }),
        ).toThrow();
    });
    it('bounds owner audio draft input without accepting arbitrary source authority', () => {
        const source = {
            kind: 'knowledge-audio-draft',
            noteId: randomUUID(),
            branchId: randomUUID(),
            blockId: randomUUID(),
            sourceText: 'Bonjour.',
            language: 'fr',
        };
        expect(SpeechSourceSchema.safeParse(source).success).toBe(true);
        for (const sourceText of ['', '   ', 'x'.repeat(8001), 'bad\u0000text'])
            expect(
                SpeechSourceSchema.safeParse({ ...source, sourceText }).success,
            ).toBe(false);
        expect(
            SpeechSourceSchema.safeParse({ ...source, ownerId: randomUUID() })
                .success,
        ).toBe(false);
        expect(
            SpeechSourceSchema.safeParse({
                ...source,
                branchId: 'not-a-branch',
            }).success,
        ).toBe(false);
    });
    it('rejects client text and forged stored share digests at the public boundary', () => {
        const source = {
            kind: 'knowledge-snippet',
            noteId: randomUUID(),
            blockId: vocabulary.id,
            origin: {
                kind: 'working',
                branchId: randomUUID(),
                expectedBranchVersion: 1,
            },
            selector: { kind: 'vocabulary', entryId, field: 'term' },
        };
        expect(SpeechSourceSchema.safeParse(source).success).toBe(true);
        expect(
            SpeechSourceSchema.safeParse({ ...source, text: 'arbitrary text' })
                .success,
        ).toBe(false);
        expect(
            SpeechSourceSchema.safeParse({
                ...source,
                selector: { ...source.selector, field: 'translation' },
            }).success,
        ).toBe(false);
        expect(
            SpeechSourceSchema.safeParse({
                ...source,
                origin: {
                    kind: 'saved',
                    expectedNoteVersion: 1,
                    access: {
                        kind: 'note',
                        locator: 'a'.repeat(24),
                        keyDigest: 'b'.repeat(43),
                    },
                },
            }).success,
        ).toBe(false);
    });
});
