import {
    KnowledgeBodySchema,
    type KnowledgeBody,
    type LearningBlock,
} from '@languon/contracts';

/** Frozen proposal sources validate references without becoming visible output. */
export function validateKnowledgeFragment(
    body: KnowledgeBody,
    dependencies: LearningBlock[] = [],
): KnowledgeBody {
    const count = body.document.content?.length ?? 0;
    const complete = KnowledgeBodySchema.parse({
        ...body,
        document: {
            ...body.document,
            content: [
                ...(body.document.content ?? []),
                ...dependencies.map((block) => ({
                    type: 'learningBlock',
                    attrs: { block },
                })),
            ],
        },
    });

    return {
        ...complete,
        document: {
            ...complete.document,
            content: complete.document.content?.slice(0, count),
        },
    };
}
