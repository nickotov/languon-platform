import { z } from 'zod';
import { KnowledgeWorkingBranchSchema } from './contextual-assistant';
import { WorkbookLearningShareAccessSchema } from './workbook-learning';

export const CopyKnowledgeBlocksRequestSchema = z
    .object({
        operationId: z.uuid(),
        branchId: z.uuid(),
        expectedBranchVersion: z.number().int().positive(),
        preview: z.boolean().default(false),
        source: z.discriminatedUnion('kind', [
            z
                .object({
                    kind: z.literal('owned-working'),
                    noteId: z.uuid(),
                    branchId: z.uuid(),
                    expectedVersion: z.number().int().positive(),
                })
                .strict(),
            z
                .object({
                    kind: z.literal('saved'),
                    noteId: z.uuid(),
                    expectedVersion: z.number().int().positive(),
                    access: WorkbookLearningShareAccessSchema.optional(),
                })
                .strict(),
        ]),
        blockIds: z
            .array(z.uuid())
            .min(1)
            .max(50)
            .refine((ids) => new Set(ids).size === ids.length),
    })
    .strict();
export const CopyKnowledgeBlocksResponseSchema = z
    .object({
        branch: KnowledgeWorkingBranchSchema.nullable(),
        selectedCount: z.number().int().min(1).max(50),
        blockCount: z.number().int().min(1).max(50).nullable(),
        dependencyCount: z.number().int().min(0).max(49).nullable(),
        mediaCount: z.number().int().min(0).max(50).nullable(),
        replayed: z.boolean(),
    })
    .strict();
export type CopyKnowledgeBlocksRequest = z.infer<
    typeof CopyKnowledgeBlocksRequestSchema
>;
