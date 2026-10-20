import { describe, expect, it } from 'vitest';
import type { CopiedAttachment } from '@languon/contracts';
import {
    appendAssistantAttachment,
    knowledgeProposalQuestion,
    referenceLength,
} from '@/fsd/widgets/contextual-assistant/lib/assistant-input';

function attachment(content = 'A learning passage'): CopiedAttachment {
    return { id: crypto.randomUUID(), label: 'Selection', content };
}

describe('assistant input bounds', () => {
    it('retains the first ten attachments and explicitly rejects an eleventh', () => {
        const previous = Array.from({ length: 10 }, () => attachment());
        const result = appendAssistantAttachment(
            previous,
            attachment('eleventh'),
            'en',
        );
        expect(result.attachments).toBe(previous);
        expect(result.error).toMatch(/10 items/);
    });
    it('accepts the exact content boundary but rejects larger selections without truncating', () => {
        const exact = attachment('a'.repeat(80_000));
        expect(appendAssistantAttachment([], exact, 'en')).toEqual({
            attachments: [exact],
            error: null,
        });
        const tooLarge = attachment('b'.repeat(80_001));
        const previous = [attachment()];
        const result = appendAssistantAttachment(previous, tooLarge, 'fr');
        expect(result.attachments).toBe(previous);
        expect(result.error).toMatch(/80 000/);
        expect(tooLarge.content).toHaveLength(80_001);
    });
    it('admits the tenth copied item through the same bounds used for page selections', () => {
        const previous = Array.from({ length: 9 }, () => attachment());
        const last = attachment();
        const result = appendAssistantAttachment(previous, last, 'ru');
        expect(result.attachments).toHaveLength(10);
        expect(result.attachments[9]).toBe(last);
        expect(result.error).toBeNull();
    });
    it('counts original reference bodies and explicitly selected translations together', () => {
        const first: CopiedAttachment = {
            id: crypto.randomUUID(),
            kind: 'text-reference',
            label: 'First Text',
            content: '🦉'.repeat(10_000),
            translation: 'a'.repeat(20_000),
        };
        const exact: CopiedAttachment = {
            id: crypto.randomUUID(),
            kind: 'text-reference',
            label: 'Second Text',
            content: 'b'.repeat(10_000),
        };
        expect(referenceLength([first, exact])).toBe(40_000);
        expect(appendAssistantAttachment([first], exact, 'en', 40_000)).toEqual(
            {
                attachments: [first, exact],
                error: null,
            },
        );
        const over = { ...exact, content: `${exact.content}c` };
        const rejected = appendAssistantAttachment([first], over, 'en', 40_000);
        expect(rejected.attachments).toEqual([first]);
        expect(rejected.error).toBe(
            'Reference text exceeds the 40,000-character limit. Remove a reference or select a shorter passage.',
        );
    });
    it('accepts exactly 40,000 non-BMP reference characters', () => {
        const text: CopiedAttachment = {
            id: crypto.randomUUID(),
            kind: 'text-reference',
            label: 'Owl passage',
            content: '🦉'.repeat(40_000),
        };
        expect(appendAssistantAttachment([], text, 'en', 40_000)).toEqual({
            attachments: [text],
            error: null,
        });
    });
    it('identifies the full earlier answer with a bounded Unicode-safe excerpt', () => {
        const answer = '🦉'.repeat(30_000) + 'not copied';
        const prompt = knowledgeProposalQuestion(
            'Prepare a Knowledge note.',
            answer,
            'en',
        );
        expect(prompt).toContain('full earlier assistant answer');
        expect(prompt).toContain(
            'only an identifying excerpt, not the full answer',
        );
        expect(prompt).toContain('🦉'.repeat(1000));
        expect(prompt).not.toContain('not copied');
        expect(prompt.isWellFormed()).toBe(true);
        expect(prompt.length).toBeLessThan(20_000);
        expect(new TextEncoder().encode(prompt).length).toBeLessThan(8_000);
    });
    it('preserves a general note request when no answer was selected', () => {
        expect(
            knowledgeProposalQuestion('Prepare a note', undefined, 'es'),
        ).toBe('Prepare a note');
    });
});
