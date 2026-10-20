import { describe, expect, it } from 'vitest';
import { Schema } from '@tiptap/pm/model';
import {
    editorPlainOffset,
    editorPlainText,
    hashEditorText,
    restoreEditorPositions,
} from '../src/fsd/features/knowledge-notes/lib/editor-target-anchor';

const schema = new Schema({
    nodes: {
        doc: { content: 'paragraph+' },
        paragraph: { content: 'text*', group: 'block' },
        text: { group: 'inline' },
    },
});

function document(...paragraphs: string[]) {
    return schema.node(
        'doc',
        undefined,
        paragraphs.map((text) =>
            schema.node('paragraph', undefined, text ? schema.text(text) : []),
        ),
    );
}

describe('durable editor target anchor', () => {
    it('rehydrates the exact selection even when the same words occur elsewhere', async () => {
        const doc = document('repeat and repeat');
        const content = editorPlainText(doc);
        const anchor = {
            from: 11,
            to: 17,
            originalText: 'repeat',
            documentHash: await hashEditorText(content),
        };
        const positions = restoreEditorPositions(doc, anchor);
        expect(positions).toEqual({ from: 12, to: 18 });
        expect(editorPlainOffset(doc, positions!.from)).toBe(anchor.from);
        expect(editorPlainOffset(doc, positions!.to)).toBe(anchor.to);
    });

    it('keeps UTF-16 offsets and hashes the complete plain-text snapshot', async () => {
        const doc = document('A😀B', 'next');
        const content = editorPlainText(doc);
        expect(content).toBe('A😀B\nnext');
        expect(editorPlainOffset(doc, 4)).toBe(3);
        expect(await hashEditorText(content)).toMatch(/^[a-f0-9]{64}$/);
        expect(
            restoreEditorPositions(doc, {
                from: 2,
                to: 3,
                originalText: content.slice(2, 3),
                documentHash: await hashEditorText(content),
            }),
        ).toBeNull();
    });

    it('keeps a cursor at the end of the first paragraph on that paragraph', () => {
        const doc = document('first', 'second');
        expect(
            restoreEditorPositions(doc, {
                from: 5,
                to: 5,
                originalText: '',
                documentHash: 'unused-by-position-check',
            }),
        ).toEqual({ from: 6, to: 6 });
    });
});
