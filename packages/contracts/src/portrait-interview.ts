import { ActionBillingSchema } from './ai-action';
import { z } from 'zod';
import {
    PortraitAnswerSchema,
    PortraitInterviewChatSchema,
    PortraitInterviewTopicSchema,
    PortraitLocaleSchema,
    PortraitInterviewerOutputSchema,
    PortraitItemsSchema,
    portraitTextSchema,
} from './learner-portrait';
export const StartPortraitInterviewSchema = z
    .object({
        expectedVersion: z.number().int().nonnegative(),
        locale: PortraitLocaleSchema,
    })
    .strict();
export const PortraitInterviewSubmissionSchema = z.discriminatedUnion('kind', [
    z
        .object({
            kind: z.literal('answer'),
            topic: PortraitInterviewTopicSchema,
            requestedLocale: PortraitLocaleSchema.optional(),
            text: PortraitAnswerSchema.optional(),
            selected: z.array(PortraitAnswerSchema).max(12).optional(),
        })
        .strict()
        .refine(
            (value) => Boolean(value.text || value.selected?.length),
            'Provide an answer.',
        ),
    z
        .object({
            kind: z.literal('chat'),
            topic: PortraitInterviewTopicSchema,
            requestedLocale: PortraitLocaleSchema.optional(),
            text: PortraitInterviewChatSchema,
        })
        .strict(),
    z
        .object({
            kind: z.literal('skip'),
            topic: PortraitInterviewTopicSchema,
            requestedLocale: PortraitLocaleSchema.optional(),
        })
        .strict(),
]);
export const SubmitPortraitInterviewSchema = z
    .object({
        confirmedQuoteId: z.uuid().optional(),
        interviewId: z.uuid(),
        expectedVersion: z.number().int().nonnegative(),
        expectedGeneration: z.number().int().nonnegative(),
        idempotencyKey: z.uuid(),
        paidAcknowledged: z.boolean().default(false),
        input: PortraitInterviewSubmissionSchema,
    })
    .strict();
export const PortraitOperationParamsSchema = z
    .object({ operationId: z.uuid() })
    .strict();
export const PortraitInterviewOperationResponseSchema = z
    .object({
        billing: ActionBillingSchema.optional(),
        id: z.uuid(),
        interviewId: z.uuid(),
        state: z.enum([
            'queued',
            'running',
            'succeeded',
            'failed',
            'cancelled',
        ]),
        result: PortraitInterviewerOutputSchema.nullable(),
        errorCode: z.string().nullable(),
    })
    .strict();

export const SetPortraitInterviewLocaleSchema =
    StartPortraitInterviewSchema.extend({ interviewId: z.uuid() });

export const PortraitInterviewActiveOperationSchema =
    PortraitInterviewOperationResponseSchema.extend({
        state: z.enum(['queued', 'running', 'cancelled']),
        result: z.null(),
        errorCode: z.null(),
    });
export const PortraitInterviewCompletedOperationSchema =
    PortraitInterviewOperationResponseSchema.extend({
        state: z.literal('succeeded'),
        result: PortraitInterviewerOutputSchema,
        errorCode: z.null(),
        baseVersion: z.number().int().nonnegative(),
        baseGeneration: z.number().int().nonnegative(),
        stale: z.boolean(),
    });
export type PortraitInterviewCompletedOperation = z.infer<
    typeof PortraitInterviewCompletedOperationSchema
>;

export type PortraitInterviewActiveOperation = z.infer<
    typeof PortraitInterviewActiveOperationSchema
>;

/** Failed/cancelled input is private recovery data, never an approved portrait fact. */
export const PortraitInterviewLastAttemptSchema = z
    .object({
        id: z.uuid(),
        interviewId: z.uuid(),
        state: z.enum(['failed', 'cancelled']),
        input: PortraitInterviewSubmissionSchema,
        errorCode: z.string().nullable(),
        baseVersion: z.number().int().nonnegative(),
        baseGeneration: z.number().int().nonnegative(),
        stale: z.boolean(),
    })
    .strict();
export type PortraitInterviewLastAttempt = z.infer<
    typeof PortraitInterviewLastAttemptSchema
>;

/** Private, owner-scoped interview state; never persist this in browser storage. */
export const PortraitInterviewContextSchema = z
    .object({
        locale: PortraitLocaleSchema,
        approvedItems: PortraitItemsSchema.nullable(),
        draftItems: PortraitItemsSchema.nullable(),
        messages: z
            .array(
                z
                    .object({
                        role: z.enum(['user', 'assistant']),
                        content: portraitTextSchema(3000),
                    })
                    .strict(),
            )
            .max(40),
        completedTopics: z.array(PortraitInterviewTopicSchema).max(8),
    })
    .strict();

export const SetPortraitInterviewLocaleResponseSchema = z
    .object({
        interviewId: z.uuid(),
        expiresAt: z.iso.datetime(),
        context: PortraitInterviewContextSchema,
    })
    .strict();

export const StartPortraitInterviewResponseSchema =
    SetPortraitInterviewLocaleResponseSchema.extend({
        initialQuestion: PortraitInterviewerOutputSchema,
        activeOperation: PortraitInterviewActiveOperationSchema.optional(),
        latestCompletedOperation:
            PortraitInterviewCompletedOperationSchema.optional(),
        lastAttempt: PortraitInterviewLastAttemptSchema.optional(),
        creditsBypass: z.boolean(),
    });

export type StartPortraitInterviewResponse = z.infer<
    typeof StartPortraitInterviewResponseSchema
>;
export type SetPortraitInterviewLocaleResponse = z.infer<
    typeof SetPortraitInterviewLocaleResponseSchema
>;
export type PortraitInterviewContext = z.infer<
    typeof PortraitInterviewContextSchema
>;

export const PortraitInterviewStatusResponseSchema = z
    .object({
        interview: z
            .object({
                id: z.uuid(),
                locale: PortraitLocaleSchema,
                expiresAt: z.iso.datetime(),
            })
            .strict()
            .nullable(),
        creditsBypass: z.boolean(),
    })
    .strict();
export type PortraitInterviewStatusResponse = z.infer<
    typeof PortraitInterviewStatusResponseSchema
>;
