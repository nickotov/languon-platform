import { describe, expect, it } from 'vitest';
import { createContextualTutorTools } from './contextual-tutor-tools';

const proposal = {
    title: 'Articles',
    summary: '',
    categories: ['grammar'],
    studiedLanguage: 'en',
    explanationLanguage: 'en',
    body: {
        schemaVersion: 1,
        document: {
            type: 'doc',
            content: [
                {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'A noun.' }],
                },
            ],
        },
    },
};

describe('legacy Knowledge proposal authority', () => {
    const tool = createContextualTutorTools({
        signal: new AbortController().signal,
        readContext: async () => ({ material: [], total: 0 }),
        onDraft: async () => ({ id: 'draft-1' }),
    }).propose_knowledge_note;

    async function accepts(value: unknown) {
        if (!tool.inputSchema)
            throw new Error('Proposal tool must validate input.');
        const result = await tool.inputSchema['~standard'].validate(value);
        return !result.issues;
    }

    it('accepts the established prose document shape', async () => {
        expect(await accepts(proposal)).toBe(true);
    });

    it('does not admit a future document version through the legacy tool', async () => {
        expect(
            await accepts({
                ...proposal,
                body: { ...proposal.body, schemaVersion: 2 },
            }),
        ).toBe(false);
    });

    it('rejects an interactive node disguised as a legacy document', async () => {
        expect(
            await accepts({
                ...proposal,
                body: {
                    schemaVersion: 1,
                    document: {
                        type: 'doc',
                        content: [
                            { type: 'learningBlock', attrs: { id: 'foreign' } },
                        ],
                    },
                },
            }),
        ).toBe(false);
    });
});
