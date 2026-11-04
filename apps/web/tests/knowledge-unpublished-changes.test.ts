import { describe, expect, it } from 'vitest';
import type { KnowledgeNoteContent } from '@languon/contracts';
import { hasUnpublishedKnowledgeChanges } from '../src/fsd/pages/knowledge/lib/unpublished-knowledge-changes';

const content: KnowledgeNoteContent = {
    title: 'Study words',
    summary: '',
    categories: ['vocabulary'],
    studiedLanguage: 'es',
    explanationLanguage: 'en',
    body: {
        schemaVersion: 2,
        document: {
            type: 'doc',
            content: [
                {
                    type: 'learningBlock',
                    attrs: {
                        block: {
                            id: '00000000-0000-4000-8000-000000000001',
                            type: 'vocabulary',
                            language: 'es',
                            translationLanguage: 'en',
                            entries: [
                                {
                                    id: '00000000-0000-4000-8000-000000000002',
                                    term: 'casa',
                                    translation: 'house',
                                },
                                {
                                    id: '00000000-0000-4000-8000-000000000003',
                                    term: 'perro',
                                    translation: 'dog',
                                },
                            ],
                        },
                    },
                },
            ],
        },
    },
};

function reorderObjectKeys(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map(reorderObjectKeys);
    }

    if (!value || typeof value !== 'object') {
        return value;
    }

    return Object.fromEntries(
        Object.entries(value)
            .reverse()
            .map(([key, child]) => [key, reorderObjectKeys(child)]),
    );
}

describe('Knowledge publication comparison', () => {
    it('recognizes saved generated blocks after JSONB reordered their object keys', () => {
        const published = reorderObjectKeys(content) as KnowledgeNoteContent;

        expect(JSON.stringify(content)).not.toBe(JSON.stringify(published));
        expect(hasUnpublishedKnowledgeChanges(content, published)).toBe(false);
    });

    it('retains unsaved changes when a vocabulary value changes', () => {
        const edited = structuredClone(content);
        const block = edited.body.document.content![0]!.attrs!.block!;
        if (block.type !== 'vocabulary') {
            throw new Error('Expected vocabulary fixture');
        }

        block.entries[0]!.translation = 'home';

        expect(hasUnpublishedKnowledgeChanges(edited, content)).toBe(true);
    });

    it('retains unsaved changes when ordered vocabulary entries are rearranged', () => {
        const edited = structuredClone(content);
        const block = edited.body.document.content![0]!.attrs!.block!;
        if (block.type !== 'vocabulary') {
            throw new Error('Expected vocabulary fixture');
        }

        block.entries.reverse();

        expect(hasUnpublishedKnowledgeChanges(edited, content)).toBe(true);
    });

    it('compares authored fields without saved note metadata', () => {
        const published = { ...content, id: 'saved-note', version: 2 };

        expect(hasUnpublishedKnowledgeChanges(content, published)).toBe(false);
        expect(
            hasUnpublishedKnowledgeChanges(
                { ...content, title: 'Edited' },
                published,
            ),
        ).toBe(true);
    });

    it('keeps unpublished drafts dirty and tolerates loading content for a published note', () => {
        expect(hasUnpublishedKnowledgeChanges(content, null)).toBe(true);
        expect(hasUnpublishedKnowledgeChanges(undefined, content)).toBe(false);
    });
});
