import { describe, expect, it } from 'vitest';
import type { KnowledgeNode, LearningBlock } from '@languon/contracts';
import {
    hasKnowledgeText,
    knowledgePlainText,
} from '@/fsd/pages/knowledge/lib/workspace-document';

const id = '11111111-1111-4111-8111-111111111111';
function document(block: LearningBlock): KnowledgeNode {
    return {
        type: 'doc',
        content: [{ type: 'learningBlock', attrs: { block } }],
    };
}

describe('interactive document publication gate', () => {
    it('allows a document containing only a video block to be saved', () => {
        const body = document({
            id,
            type: 'video',
            source: { kind: 'youtube', videoId: 'abcdefghijk' },
        });
        expect(hasKnowledgeText(body)).toBe(true);
        expect(knowledgePlainText(body)).toContain('abcdefghijk');
    });
    it('includes authored block content in fallback context and statistics', () => {
        const body = document({
            id,
            type: 'grammar',
            language: 'en',
            rule: 'Use the past simple for completed actions.',
        });
        expect(hasKnowledgeText(body)).toBe(true);
        expect(knowledgePlainText(body)).toContain('completed actions');
    });
    it('keeps empty prose drafts unpublished', () => {
        expect(
            hasKnowledgeText({ type: 'doc', content: [{ type: 'paragraph' }] }),
        ).toBe(false);
    });
});
