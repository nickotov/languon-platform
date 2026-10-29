import { z } from 'zod';
import { LearningBlockSchema } from './learning-blocks';
import { KnowledgeWorkingBranchSchema } from './contextual-assistant';

export const LearningBlockProposalInputSchema = z
    .object({
        blocks: z.array(LearningBlockSchema).min(1).max(25),
        targetBlockId: z.uuid().optional(),
    })
    .strict()
    .refine(
        (value) => JSON.stringify(value).length <= 100_000,
        'The proposed content is too large.',
    )
    .refine(
        (value) => !value.targetBlockId || value.blocks.length === 1,
        'An update must propose exactly one replacement block.',
    );
export const KnowledgeBlockProposalSchema = z
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
        dependencies: z.array(LearningBlockSchema).max(50).optional(),
        blocks: z.array(LearningBlockSchema).min(1).max(25),
        createdAt: z.iso.datetime(),
        appliedAt: z.iso.datetime().nullable(),
        appliedBranchVersion: z.number().int().positive().nullable(),
    })
    .strict();
export const KnowledgeBlockProposalsResponseSchema = z
    .object({ proposals: z.array(KnowledgeBlockProposalSchema).max(100) })
    .strict();
export const ApplyKnowledgeBlockProposalRequestSchema = z
    .object({
        expectedBranchVersion: z.number().int().positive(),
        mode: z.enum(['proposal', 'add-separately']).optional(),
    })
    .strict();
export const ApplyKnowledgeBlockProposalResponseSchema = z
    .object({
        proposal: KnowledgeBlockProposalSchema,
        branch: KnowledgeWorkingBranchSchema,
    })
    .strict();
export type LearningBlockProposalInput = z.infer<
    typeof LearningBlockProposalInputSchema
>;
export type KnowledgeBlockProposal = z.infer<
    typeof KnowledgeBlockProposalSchema
>;
