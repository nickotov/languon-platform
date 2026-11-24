import { learningContentReplyLanguageSchema } from './learning-content-presentation';
import { z } from 'zod';
import { LearningBlockSchema } from '@languon/contracts';
import { AssistantLanguageSchema } from '@languon/contracts';
import { LearningContentBriefSchema } from './learning-content-contract';

const responseText = z.string().trim().min(1).max(4_000);
export const ExplanationLanguageOverrideSchema = z
    .object({
        taskId: z.string().trim().min(1).max(80),
        language: z.string().regex(/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u),
        evidence: z.string().trim().min(3).max(300),
    })
    .strict();
const explanationLanguageOverrides = z
    .array(ExplanationLanguageOverrideSchema)
    .max(8)
    .optional();
const generation = {
    brief: LearningContentBriefSchema,
    continuesPending: z.boolean().optional(),
    changesReplyLanguage: z.boolean().optional(),
    explanationLanguageOverrides,
    acknowledgement: responseText.optional(),
    sourceProposalIds: z.array(z.uuid()).max(8).optional(),
    sourceMatch: z
        .object({ term: z.string().min(1).max(500) })
        .strict()
        .optional(),
};

export const TutorRequestResolutionSchema = z.discriminatedUnion('kind', [
    z
        .object({
            replyLanguage: AssistantLanguageSchema.optional(),
            kind: z.literal('answer'),
            purpose: z.enum(['conversation', 'learning-explanation']),
            documentUse: z.boolean(),
        })
        .strict(),
    z
        .object({
            replyLanguage: AssistantLanguageSchema.optional(),
            kind: z.literal('clarify'),
            continuesPending: z.boolean().optional(),
            changesReplyLanguage: z.boolean().optional(),
            explanationLanguageOverrides,
            question: responseText,
            brief: LearningContentBriefSchema,
        })
        .strict(),
    z
        .object({
            replyLanguage: learningContentReplyLanguageSchema,
            kind: z.literal('generate'),
            ...generation,
        })
        .strict(),
    z
        .object({
            replyLanguage: learningContentReplyLanguageSchema,
            kind: z.literal('revise'),
            ...generation,
            targetBlockId: z.uuid(),
        })
        .strict(),
    z
        .object({
            replyLanguage: AssistantLanguageSchema.optional(),
            kind: z.literal('revise-blocks'),
            sourceBlockIds: z.array(z.uuid()).min(1).max(8),
            instruction: responseText,
        })
        .strict(),
    z
        .object({
            replyLanguage: AssistantLanguageSchema.optional(),
            kind: z.literal('copy'),
            sourceBlockIds: z
                .array(z.uuid())
                .min(1)
                .max(8)
                .refine((ids) => new Set(ids).size === ids.length),
        })
        .strict(),
    z
        .object({
            replyLanguage: AssistantLanguageSchema.optional(),
            kind: z.literal('unsupported'),
            answer: responseText,
        })
        .strict(),
    z
        .object({
            replyLanguage: AssistantLanguageSchema.optional(),
            kind: z.literal('abandon'),
            answer: responseText,
        })
        .strict(),
]);
export type TutorRequestResolution = z.infer<
    typeof TutorRequestResolutionSchema
>;

export const tutorRequestStateKey = 'learning-request:v1';
export const TutorRequestStateSchema = z
    .object({
        pending: LearningContentBriefSchema.nullable(),
        replyLanguage: AssistantLanguageSchema.optional(),
        pendingExplanationOverrides: z
            .array(
                ExplanationLanguageOverrideSchema.omit({
                    evidence: true,
                }).extend({
                    studiedLanguage: z.union([
                        z.literal('*'),
                        ExplanationLanguageOverrideSchema.shape.language,
                    ]),
                }),
            )
            .max(8)
            .optional(),
        pendingReadingChoices: z
            .array(
                z
                    .object({
                        key: z.string().max(150),
                        label: z.string().max(240),
                    })
                    .strict(),
            )
            .min(2)
            .max(8)
            .optional(),
        pendingProposalIds: z.array(z.uuid()).max(8).optional(),
        pendingSources: z
            .object({
                blocks: z.array(LearningBlockSchema).max(25),
                tasks: z
                    .array(
                        z
                            .object({
                                taskId: z.string().min(1).max(80),
                                blockIds: z.array(z.uuid()).max(25),
                                proposalOrigins: z
                                    .array(
                                        z
                                            .object({
                                                blockId: z.uuid(),
                                                proposalId: z.uuid(),
                                            })
                                            .strict(),
                                    )
                                    .max(25)
                                    .optional(),
                                providedMaterialId: z.uuid().optional(),
                                selectionOrigin: z
                                    .object({
                                        noteId: z.uuid(),
                                        noteVersion: z
                                            .number()
                                            .int()
                                            .nonnegative(),
                                    })
                                    .strict()
                                    .optional(),
                            })
                            .strict(),
                    )
                    .max(8),
            })
            .strict()
            .refine(
                (value) => JSON.stringify(value).length <= 60_000,
                'Pending source snapshots exceed the bounded state allowance.',
            )
            .optional(),
        proposals: z
            .array(
                z
                    .object({
                        id: z.uuid(),
                        summary: z.string().max(2_000),
                        kinds: z.array(z.string().max(40)).max(6).optional(),
                        titles: z.array(z.string().max(200)).max(8).optional(),
                        terms: z.array(z.string().max(500)).max(20).optional(),
                        termsComplete: z.boolean().optional(),
                        ordinal: z.number().int().positive().optional(),
                    })
                    .strict(),
            )
            .max(8),
    })
    .strict();
export type TutorRequestState = z.infer<typeof TutorRequestStateSchema>;
