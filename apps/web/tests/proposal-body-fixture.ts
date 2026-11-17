import { KnowledgeBodySchema } from '@languon/contracts';

export function proposalBody(blocks: unknown[]) {
    return KnowledgeBodySchema.parse({
        schemaVersion: 2,
        document: {
            type: 'doc',
            content: blocks.map((block) => ({
                type: 'learningBlock',
                attrs: { block },
            })),
        },
    });
}
