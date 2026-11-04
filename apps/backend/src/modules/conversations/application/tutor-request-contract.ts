import { learningContentReplyLanguageSchema } from './learning-content-presentation';
import { z } from 'zod';
import { AssistantLanguageSchema } from '@languon/contracts';
import { LearningContentBriefSchema } from './learning-content-contract';

const responseText = z.string().trim().min(1).max(4_000);
const generation = {
    brief: LearningContentBriefSchema,
    continuesPending: z.boolean().optional(),
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
            kind: z.literal('legacy-revision'),
        })
        .strict(),
    z
        .object({
            replyLanguage: AssistantLanguageSchema.optional(),
            kind: z.literal('legacy-copy'),
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
