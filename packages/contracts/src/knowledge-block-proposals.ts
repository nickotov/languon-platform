import { z } from 'zod';
import { LearningBlockSchema } from './learning-blocks';
import { KnowledgeWorkingBranchSchema } from './contextual-assistant';

export const LearningBlockProposalInputSchema = z
    .object({ blocks: z.array(LearningBlockSchema).min(1).max(25) })
    .strict()
    .refine(
        (value) => JSON.stringify(value).length <= 100_000,
        'The proposed content is too large.',
    );
export const KnowledgeBlockProposalSchema = z
    .object({
        id: z.uuid(),
        conversationId: z.uuid(),
        noteId: z.uuid(),
        branchId: z.uuid(),
        baseBranchVersion: z.number().int().positive(),
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
    .object({ expectedBranchVersion: z.number().int().positive() })
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
