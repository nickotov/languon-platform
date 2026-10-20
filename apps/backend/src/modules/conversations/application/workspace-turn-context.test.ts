import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { SubmitConversationTurnRequestSchema } from '@languon/contracts';
import {
    assertWorkspaceTurnContext,
    firstThreeWords,
    referenceCharacters,
} from './workspace-turn-context';
import { projectTutorUserMessage } from './tutor-message-context';

const id = '11111111-1111-4111-8111-111111111111';
const anchor = (content: string, from = content.length, to = from) => ({
    from,
    to,
    originalText: content.slice(from, to),
    documentHash: createHash('sha256').update(content).digest('hex'),
});
const request = (editor: string, content: string, translation?: string) =>
    SubmitConversationTurnRequestSchema.parse({
        requestId: id,
        content: 'Explain this',
        editorContext: { content: editor, editorTarget: anchor(editor) },
        attachments: [
            {
                id,
                kind: 'text-reference',
                label: 'Reference',
                content,
                ...(translation ? { translation } : {}),
            },
        ],
    });

describe('workspace turn context', () => {
    it('requires a serializable editor anchor for workspace requests', () => {
        const valid = request('A paragraph.', 'reference');
        expect(
            SubmitConversationTurnRequestSchema.safeParse({
                ...valid,
                editorContext: { content: 'A paragraph.' },
            }).success,
        ).toBe(false);
        expect(
            SubmitConversationTurnRequestSchema.safeParse(valid).success,
        ).toBe(true);
    });
    it('counts complete Unicode code points including whitespace and explicit translations', () => {
        const input = request('a 😀', 'x\ny', '😀');
        expect(referenceCharacters(input.attachments)).toBe(4);
        expect(() =>
            assertWorkspaceTurnContext(input, {
                editorCharacters: 3,
                referenceCharacters: 4,
            }),
        ).not.toThrow();
        expect(() =>
            assertWorkspaceTurnContext(input, {
                editorCharacters: 3,
                referenceCharacters: 3,
            }),
        ).toThrow(/Reference text exceeds the 3-character limit/u);
    });

    it('cannot bypass the aggregate limit by relabeling a copied body as legacy text', () => {
        const input = request('', 'abc');
        input.attachments.push({
            id: '22222222-2222-4222-8222-222222222222',
            kind: 'text',
            label: 'Legacy copy',
            content: 'def',
        });
        expect(referenceCharacters(input.attachments)).toBe(6);
        expect(() =>
            assertWorkspaceTurnContext(input, {
                editorCharacters: 1,
                referenceCharacters: 6,
            }),
        ).not.toThrow();
        input.attachments[1]!.content = 'defg';
        expect(() =>
            assertWorkspaceTurnContext(input, {
                editorCharacters: 1,
                referenceCharacters: 6,
            }),
        ).toThrow(/Reference text exceeds the 6-character limit/u);
    });

    it('rejects an oversized complete editor and a stale selected passage', () => {
        const input = request('one two', 'reference');
        expect(() =>
            assertWorkspaceTurnContext(input, {
                editorCharacters: 6,
                referenceCharacters: 40,
            }),
        ).toThrow(/editor exceeds/u);
        input.editorContext!.selectedText = 'missing';
        expect(() =>
            assertWorkspaceTurnContext(input, {
                editorCharacters: 40,
                referenceCharacters: 40,
            }),
        ).toThrow(/no longer in the editor/u);
    });

    it('validates the frozen hash and exact offset even when the same text appears elsewhere', () => {
        const input = request('same text, same text', 'reference');
        input.editorContext!.editorTarget = anchor(
            input.editorContext!.content,
            0,
            4,
        );
        expect(() =>
            assertWorkspaceTurnContext(input, {
                editorCharacters: 100,
                referenceCharacters: 100,
            }),
        ).not.toThrow();
        input.editorContext!.editorTarget = {
            ...input.editorContext!.editorTarget,
            from: 1,
            to: 5,
        };
        expect(() =>
            assertWorkspaceTurnContext(input, {
                editorCharacters: 100,
                referenceCharacters: 100,
            }),
        ).toThrow(/target changed/u);
        input.editorContext!.editorTarget = {
            ...anchor(input.editorContext!.content, 0, 4),
            documentHash: '0'.repeat(64),
        };
        expect(() =>
            assertWorkspaceTurnContext(input, {
                editorCharacters: 100,
                referenceCharacters: 100,
            }),
        ).toThrow(/target changed/u);
    });

    it('rejects surrogate-splitting offsets and invalid explicit proposal modes', () => {
        const input = request('a😀b', 'reference');
        input.editorContext!.editorTarget = anchor(
            input.editorContext!.content,
            2,
            3,
        );
        expect(() =>
            assertWorkspaceTurnContext(input, {
                editorCharacters: 100,
                referenceCharacters: 100,
            }),
        ).toThrow(/target changed/u);
        input.editorContext!.editorTarget = anchor(
            input.editorContext!.content,
        );
        input.editorContext!.proposalTarget = {
            ...anchor(input.editorContext!.content, 1, 3),
            mode: 'insert',
        };
        expect(() =>
            assertWorkspaceTurnContext(input, {
                editorCharacters: 100,
                referenceCharacters: 100,
            }),
        ).toThrow(/target changed/u);
    });

    it('names conversations from the first three words', () => {
        expect(firstThreeWords('  Why does this sentence work?  ')).toBe(
            'Why does this',
        );
        expect(firstThreeWords('😀'.repeat(101))).toBe('😀'.repeat(100));
    });

    it('projects the complete unsaved editor and both copied reference bodies into the frozen message', () => {
        const input = request(
            'first paragraph\nsecond paragraph',
            'original text',
            'translation',
        );
        const projected = projectTutorUserMessage({
            content: input.content,
            attachments: input.attachments,
            editorContext: input.editorContext!,
        });
        const full = projected.parts.map((part) => part.text).join('\n');
        expect(full).toContain('first paragraph\nsecond paragraph');
        expect(full).toContain('original text');
        expect(full).toContain('translation');
    });
});
