import { z } from 'zod';
import { LessonTaskIdSchema } from './lesson-part-identity';
import { GenerationTaskKindSchema } from './generation-plans';
import { LearningBlockSchema } from './learning-blocks';
import {
    KnowledgeBodySchema,
    KnowledgeContentFragmentSchema,
    KnowledgeWorkingBranchSchema,
    type KnowledgeBody,
    type KnowledgeNode,
} from './contextual-assistant';

function isSingleBlock(body: KnowledgeBody) {
    const nodes = body.document.content ?? [];

    return nodes.length === 1 && nodes[0]?.type === 'learningBlock';
}

const proposalBody = KnowledgeContentFragmentSchema.refine(
    (body) =>
        (body.document.content ?? []).filter(
            (node) => node.type === 'learningBlock',
        ).length <= 25,
    'A proposal may contain at most 25 learning blocks.',
);

export const LearningContentProposalInputSchema = z
    .object({
        body: proposalBody,
        targetBlockId: z.uuid().optional(),
    })
    .strict()
    .refine(
        (value) => JSON.stringify(value).length <= 100_000,
        'The proposed content is too large.',
    )
    .refine(
        (value) => !value.targetBlockId || isSingleBlock(value.body),
        'An update must propose exactly one replacement block.',
    );
const lessonPartSchema = z
    .object({
        taskId: LessonTaskIdSchema,
        kind: GenerationTaskKindSchema,
        startIndex: z.number().int().nonnegative(),
        nodeCount: z.number().int().positive(),
        present: z.boolean(),
    })
    .strict();

export type LessonPart = z.infer<typeof lessonPartSchema>;

function nonemptyProse(node: KnowledgeNode): boolean {
    return (
        node.type === 'horizontalRule' ||
        Boolean(node.text) ||
        Boolean(node.content?.some(nonemptyProse))
    );
}

/** Any surviving member keeps its entire task unavailable for duplicate insertion. */
export function isLessonPartPresent(
    proposalId: string,
    part: Omit<LessonPart, 'kind' | 'present'>,
    proposalBody: KnowledgeBody,
    document: KnowledgeNode,
): boolean {
    const material = (proposalBody.document.content ?? []).slice(
        part.startIndex,
        part.startIndex + part.nodeCount,
    );
    const blockIds = new Set(
        material.flatMap((node) => node.attrs?.block?.id ?? []),
    );
    const marker = `${proposalId}/${part.taskId}`;
    const nodes = document.content ?? [];
    const containsMarker = (node: KnowledgeNode): boolean =>
        (node.attrs?.lessonPartId === marker &&
            (node.type === 'learningBlock' || nonemptyProse(node))) ||
        Boolean(node.attrs?.block && blockIds.has(node.attrs.block.id)) ||
        Boolean(node.content?.some(containsMarker));

    return nodes.some(containsMarker);
}

export const KnowledgeContentProposalSchema = z
    .object({
        id: z.uuid(),
        conversationId: z.uuid(),
        turnId: z.uuid().optional(),
        noteId: z.uuid(),
        branchId: z.uuid(),
        baseBranchVersion: z.number().int().positive(),
        target: z
            .object({
                blockId: z.uuid(),
                blockHash: z.string().regex(/^[a-f0-9]{64}$/u),
            })
            .strict()
            .optional(),
        targetStale: z.boolean().optional(),
        /** Derived from the completed run at read time; never supplied by an author. */
        isCompletedLesson: z.literal(true).optional(),
        lessonParts: z.array(lessonPartSchema).min(1).max(8).optional(),
        dependencies: z.array(LearningBlockSchema).max(50).optional(),
        body: proposalBody,
        createdAt: z.iso.datetime(),
        appliedAt: z.iso.datetime().nullable(),
        appliedBranchVersion: z.number().int().positive().nullable(),
    })
    .strict()
    .superRefine((value, ctx) => {
        // Joining run metadata must not push an already validated proposal over its size limit.
        if (
            JSON.stringify({
                ...value,
                isCompletedLesson: undefined,
                lessonParts: undefined,
            }).length > 100_000
        ) {
            ctx.addIssue({
                code: 'custom',
                message:
                    'The proposed content including dependencies is too large.',
            });
        }

        if (value.target && !isSingleBlock(value.body)) {
            ctx.addIssue({
                code: 'custom',
                path: ['target'],
                message:
                    'An update must propose exactly one replacement block.',
            });
        }

        // Frozen dependencies close the fragment graph without widening document writers.
        const complete = KnowledgeBodySchema.safeParse({
            schemaVersion: 2,
            document: {
                type: 'doc',
                content: [
                    ...(value.body.document.content ?? []),
                    ...(value.dependencies ?? []).map((block) => ({
                        type: 'learningBlock',
                        attrs: { block },
                    })),
                ],
            },
        });

        if (!complete.success) {
            for (const issue of complete.error.issues) {
                ctx.addIssue({
                    code: 'custom',
                    path: ['body', ...issue.path],
                    message: issue.message,
                });
            }
        }
    });
export const KnowledgeContentProposalsResponseSchema = z
    .object({ proposals: z.array(KnowledgeContentProposalSchema).max(100) })
    .strict();
const LessonCopySchema = z
    .object({
        requestId: z.uuid(),
        taskId: LessonTaskIdSchema.optional(),
    })
    .strict();

export type LessonCopy = z.infer<typeof LessonCopySchema>;

export const ApplyKnowledgeContentProposalRequestSchema = z
    .object({
        expectedBranchVersion: z.number().int().positive(),
        mode: z
            .enum(['proposal', 'add-separately', 'insert-lesson'])
            .optional(),
        lessonCopy: LessonCopySchema.optional(),
        insertionPosition: z.number().int().min(0).max(1_000_000).optional(),
    })
    .strict()
    .refine(
        (value) =>
            value.insertionPosition === undefined ||
            value.mode === 'add-separately' ||
            value.mode === 'insert-lesson',
        'Cursor insertion requires adding an independent copy.',
    )
    .refine(
        (value) =>
            (value.mode === 'insert-lesson') === Boolean(value.lessonCopy),
        'Lesson inserts require a selection and request identity.',
    );
export const ApplyKnowledgeContentProposalResponseSchema = z
    .object({
        proposal: KnowledgeContentProposalSchema,
        branch: KnowledgeWorkingBranchSchema,
    })
    .strict();
export type LearningContentProposalInput = z.infer<
    typeof LearningContentProposalInputSchema
>;
export type KnowledgeContentProposal = z.infer<
    typeof KnowledgeContentProposalSchema
>;
