import { SUPPORTED_LANGUAGE_TAGS } from '@languon/languages';
import { z } from 'zod';
import { ActionAllowanceQuoteSchema, ActionBillingSchema } from './ai-action';

const language = z.enum(SUPPORTED_LANGUAGE_TAGS);
const safeText = (max: number) =>
    z
        .string()
        .max(max)
        .refine(
            (value) =>
                !/[\uD800-\uDFFF]/u.test(value) && !value.includes('\u0000'),
            'Expected valid Unicode text.',
        );
const commonField = {
    sourceLanguage: language,
    targetLanguage: language,
    sourceText: safeText(8_000).refine((value) => value.trim().length > 0),
    currentValue: safeText(8_000),
};

/** Explicit editable fields, never an arbitrary JSON path or an authorization grant. */
export const KnowledgeBlockFieldTargetSchema = z.discriminatedUnion('kind', [
    z
        .object({
            ...commonField,
            kind: z.literal('vocabulary'),
            entryId: z.uuid(),
            field: z.enum(['translation', 'exampleTranslation']),
        })
        .strict(),
    z
        .object({
            ...commonField,
            kind: z.literal('bilingual-text'),
            segmentId: z.uuid(),
        })
        .strict(),
]);
export const RequestKnowledgeBlockFieldActionSchema = z
    .object({
        operationId: z.uuid(),
        branchId: z.uuid(),
        blockId: z.uuid(),
        action: z.enum(['check', 'generate']),
        field: KnowledgeBlockFieldTargetSchema,
    })
    .strict()
    .superRefine((value, context) => {
        if (value.action === 'check' && !value.field.currentValue.trim())
            context.addIssue({
                code: 'custom',
                path: ['field', 'currentValue'],
                message: 'Checking requires a current value.',
            });
        if (
            value.field.sourceLanguage.toLowerCase() ===
            value.field.targetLanguage.toLowerCase()
        )
            context.addIssue({
                code: 'custom',
                path: ['field', 'targetLanguage'],
                message: 'Choose a different translation language.',
            });
        if (
            value.field.kind === 'vocabulary' &&
            (value.field.sourceText.length > 2_000 ||
                value.field.currentValue.length > 2_000)
        )
            context.addIssue({
                code: 'custom',
                path: ['field'],
                message: 'Vocabulary fields exceed their limit.',
            });
    });

export const KnowledgeBlockFieldResultSchema = z.discriminatedUnion('status', [
    z
        .object({
            status: z.literal('correct'),
            explanation: safeText(2_000).min(1),
        })
        .strict(),
    z
        .object({
            status: z.literal('suggested'),
            proposedValue: safeText(8_000).refine(
                (value) => value.trim().length > 0,
            ),
            explanation: safeText(2_000).min(1),
        })
        .strict(),
]);
export const KnowledgeBlockFieldActionJobSchema = z
    .object({
        id: z.uuid(),
        status: z.enum([
            'queued',
            'running',
            'completed',
            'failed',
            'cancelled',
        ]),
        result: KnowledgeBlockFieldResultSchema.nullable(),
        failureCode: z.string().min(1).max(100).nullable(),
        billing: ActionBillingSchema.optional(),
        createdAt: z.iso.datetime(),
        completedAt: z.iso.datetime().nullable(),
    })
    .strict()
    .superRefine((value, context) => {
        const terminal = ['completed', 'failed', 'cancelled'].includes(
            value.status,
        );
        if (
            terminal !== (value.completedAt !== null) ||
            (value.status === 'completed') !== (value.result !== null) ||
            (value.status === 'failed') !== (value.failureCode !== null)
        )
            context.addIssue({
                code: 'custom',
                message: 'Field action state and result are inconsistent.',
            });
    });
export const KnowledgeBlockFieldActionResponseSchema = z
    .object({ job: KnowledgeBlockFieldActionJobSchema })
    .strict();
export type RequestKnowledgeBlockFieldAction = z.infer<
    typeof RequestKnowledgeBlockFieldActionSchema
>;
export type KnowledgeBlockFieldTarget = z.infer<
    typeof KnowledgeBlockFieldTargetSchema
>;
export type KnowledgeBlockFieldResult = z.infer<
    typeof KnowledgeBlockFieldResultSchema
>;
export type KnowledgeBlockFieldActionJob = z.infer<
    typeof KnowledgeBlockFieldActionJobSchema
>;

export const KnowledgeBlockFieldActionErrorSchema = z.object({
    error: z.object({
        code: z.string(),
        message: z.string(),
        correlationId: z.uuid(),
        details: z.object({ quote: ActionAllowanceQuoteSchema }).optional(),
    }),
});
