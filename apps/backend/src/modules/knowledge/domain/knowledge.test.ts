import { expect, it } from 'vitest';
import { KnowledgeBodySchema } from '@languon/contracts';
import { knowledgeBodyPlainText } from './knowledge';
it('indexes words crossing inline marks as a single word and preserves block boundaries', () => {
    const body = KnowledgeBodySchema.parse({
        schemaVersion: 1,
        document: {
            type: 'doc',
            content: [
                {
                    type: 'paragraph',
                    content: [
                        { type: 'text', text: 'bon' },
                        {
                            type: 'text',
                            text: 'jour',
                            marks: [{ type: 'bold' }],
                        },
                    ],
                },
                {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'tout le monde' }],
                },
            ],
        },
    });
    expect(knowledgeBodyPlainText(body)).toBe('bonjour tout le monde');
});
