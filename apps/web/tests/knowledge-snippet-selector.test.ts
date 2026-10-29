import { describe, expect, it } from 'vitest';
import type { LearningBlock } from '@languon/contracts';
import { knowledgeSnippetSelector } from '@/fsd/widgets/knowledge-speech/lib/snippet-selector';

const blockId = '00000000-0000-4000-8000-000000000001';
const entryId = '00000000-0000-4000-8000-000000000002';
const otherId = '00000000-0000-4000-8000-000000000003';
const vocabulary: LearningBlock = {
    id: blockId,
    type: 'vocabulary',
    language: 'fr',
    translationLanguage: 'ru',
    entries: [
        {
            id: entryId,
            term: 'travail',
            translation: 'работа',
            example: 'Je travaille.',
        },
    ],
};
describe('Knowledge snippet source selection', () => {
    it('selects the exact source field without forwarding renderer text', () => {
        expect(knowledgeSnippetSelector(vocabulary, 'travail', 'fr')).toEqual({
            kind: 'vocabulary',
            entryId,
            field: 'term',
        });
        expect(
            knowledgeSnippetSelector(vocabulary, 'Je travaille.', 'fr'),
        ).toEqual({ kind: 'vocabulary', entryId, field: 'example' });
        expect(knowledgeSnippetSelector(vocabulary, 'работа', 'ru')).toBeNull();
        expect(
            knowledgeSnippetSelector(vocabulary, 'arbitrary text', 'fr'),
        ).toBeNull();
        expect(
            knowledgeSnippetSelector(vocabulary, 'travail', 'en'),
        ).toBeNull();
    });
    it('binds bilingual single segments and complete original separately', () => {
        const block: LearningBlock = {
            id: blockId,
            type: 'bilingual-text',
            language: 'fr',
            segments: [
                { id: entryId, text: 'Bonjour.' },
                { id: otherId, text: 'Au revoir.' },
            ],
            translations: [],
        };
        expect(knowledgeSnippetSelector(block, 'Bonjour.', 'fr')).toEqual({
            kind: 'bilingual',
            segmentId: entryId,
        });
        expect(
            knowledgeSnippetSelector(block, 'Bonjour.\n\nAu revoir.', 'fr'),
        ).toEqual({ kind: 'bilingual' });
        expect(
            knowledgeSnippetSelector(block, 'Bonjour. Au revoir.', 'fr'),
        ).toBeNull();
    });
    it('permits prepared grammar examples, without synthesizing rules or private translations', () => {
        const block: LearningBlock = {
            id: blockId,
            type: 'grammar',
            language: 'fr',
            rule: 'A rule.',
            examples: [{ text: 'Je joue.', translation: 'Я играю.' }],
        };
        expect(knowledgeSnippetSelector(block, 'Je joue.', 'fr')).toEqual({
            kind: 'grammar-example',
            index: 0,
        });
        expect(knowledgeSnippetSelector(block, 'A rule.', 'fr')).toBeNull();
        expect(knowledgeSnippetSelector(block, 'Я играю.', 'ru')).toBeNull();
    });
    it('keeps unprepared media out of text pronunciation requests', () => {
        expect(
            knowledgeSnippetSelector(
                { id: blockId, type: 'audio' },
                'invented',
                'fr',
            ),
        ).toBeNull();
    });
});
