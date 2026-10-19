import { describe, expect, it } from 'vitest';
import { CopiedAttachmentSchema } from '@languon/contracts';
import {
    noteSourceMaterial,
    textSourceMaterial,
} from '../../../../src/modules/conversations/infrastructure/persistence/drizzle/conversation-source-material';

const source = {
    id: '00000000-0000-4000-8000-000000000001',
    version: '1',
    title: 'A saved text',
    sourceLanguage: 'es',
    targetLanguage: 'en',
};
describe('frozen source passage projection', () => {
    it('keeps a short saved source and its complete translation together', () => {
        const pairId = source.id;
        const alignment = {
            source: [
                {
                    pairId,
                    text: 'Hola.',
                    startOffset: 0,
                    endOffset: 5,
                    paragraphIndex: 0,
                },
            ],
            translation: [{ pairId, text: 'Hello.' }],
            editedPairIds: [],
        };
        const material = textSourceMaterial({
            ...source,
            sourceText: 'Hola.',
            alignment,
        });
        expect(material).toHaveLength(1);
        expect(material[0]?.content).toContain('Hola.');
        expect(material[0]?.content).toContain('Hello.');
        CopiedAttachmentSchema.parse(material[0]);
    });
    it('preserves a long Unicode note through bounded ordered plain-text passages and stable copy identifiers', () => {
        const text = 'مثال 👋 \\"\n'.repeat(3000);
        const note = {
            ...source,
            title: 'ملاحظات 👋'.repeat(15),
            summary: 'A saved explanation',
            body: {
                schemaVersion: 1 as const,
                document: {
                    type: 'doc' as const,
                    content: [
                        {
                            type: 'paragraph' as const,
                            content: [{ type: 'text' as const, text }],
                        },
                    ],
                },
            },
        };
        const first = noteSourceMaterial(note),
            replay = noteSourceMaterial(note);
        expect(first).toEqual(replay);
        expect(first.length).toBeGreaterThan(5);
        expect(new Set(first.map((item) => item.id)).size).toBe(first.length);
        expect(
            first
                .map((item) => item.content)
                .join('')
                .includes(text),
        ).toBe(true);
        for (const item of first) {
            CopiedAttachmentSchema.parse(item);
            expect(
                Buffer.byteLength(JSON.stringify(item), 'utf8'),
            ).toBeLessThan(8000);
        }
        expect(noteSourceMaterial({ ...note, version: '2' })[0]?.id).not.toBe(
            first[0]?.id,
        );
    });
});
