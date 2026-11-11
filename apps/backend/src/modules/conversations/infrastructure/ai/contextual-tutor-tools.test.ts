import { describe, expect, it } from 'vitest';
import { createContextualTutorTools } from './contextual-tutor-tools';

const proposal = {
    title: 'Articles',
    summary: '',
    categories: ['grammar'],
    studiedLanguage: 'en',
    explanationLanguage: 'en',
    body: {
        schemaVersion: 2,
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

describe('canonical prose Knowledge proposal authority', () => {
    const tools = createContextualTutorTools({
        signal: new AbortController().signal,
        readContext: async () => ({ material: [], total: 0 }),
        onDraft: async () => ({ id: 'draft-1' }),
    });

    if (!('propose_knowledge_note' in tools)) {
        throw new Error('Owner conversations must expose prose proposals.');
    }

    const tool = tools.propose_knowledge_note;

    async function accepts(value: unknown) {
        if (!tool?.inputSchema) {
            throw new Error('Proposal tool must validate input.');
        }

        const result = await tool.inputSchema['~standard'].validate(value);

        return !result.issues;
    }

    it('accepts the established prose document shape', async () => {
        expect(await accepts(proposal)).toBe(true);
    });

    it('does not admit a future document version through the prose tool', async () => {
        expect(
            await accepts({
                ...proposal,
                body: { ...proposal.body, schemaVersion: 3 },
            }),
        ).toBe(false);
    });

    it('rejects an interactive node in a prose-only proposal', async () => {
        expect(
            await accepts({
                ...proposal,
                body: {
                    schemaVersion: 2,
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

    it('omits the authoring tool for a read-only shared source', () => {
        const tools = createContextualTutorTools({
            signal: new AbortController().signal,
            readOnlySource: true,
            readContext: async () => ({ material: [], total: 0 }),
            onDraft: async () => {
                throw new Error('Must not execute');
            },
        });

        expect(Object.keys(tools)).toEqual(['read_source_context']);
    });
});
