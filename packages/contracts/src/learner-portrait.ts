import { z } from 'zod';
import { AssistantLanguageSchema } from './contextual-assistant';

/** Aggregate resource bounds include JSON escaping and UTF-8, with no truncation. */
export function portraitSerializedByteLength(value: unknown): number {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
}
export const PORTRAIT_ITEMS_MAX_BYTES = 30000;
export const PORTRAIT_SUMMARY_MAX_BYTES = 10000;
export const PORTRAIT_STATE_MAX_BYTES = 90000;

/** User-perceived Unicode characters, shared by browser and server. */
export function portraitCharacterCount(value: string): number {
    return Array.from(
        new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(
            value,
        ),
    ).length;
}
export function portraitTextSchema(maximum: number) {
    return z
        .string()
        .max(maximum * 16)
        .refine(
            (text) =>
                !/[\uD800-\uDFFF]/u.test(text) &&
                !Array.from(text).some((character) => {
                    const code = character.codePointAt(0)!;
                    return (
                        code < 32 && code !== 9 && code !== 10 && code !== 13
                    );
                }),
            'Invalid text.',
        )
        .refine(
            (text) => portraitCharacterCount(text) <= maximum,
            `Use at most ${maximum} characters.`,
        );
}
export const PortraitAnswerSchema = portraitTextSchema(200).trim().min(1);
export const PortraitInterviewChatSchema = portraitTextSchema(1000)
    .trim()
    .min(1);
export const PortraitLocaleSchema = z.enum(['en', 'ru', 'fr', 'es']);
export const PortraitLanguageLevelSchema = z.enum([
    'just-starting',
    'basic',
    'intermediate',
    'advanced',
    'fluent',
    'native',
    'unsure',
]);
export const PortraitInterviewTopicSchema = z.enum([
    'languages',
    'explanation-languages',
    'goals',
    'style',
    'accommodations',
    'hobbies',
    'age',
    'update',
]);
export const PortraitMixedLanguageFrequencySchema = z.enum([
    'helpful',
    'sometimes',
    'avoid',
]);
export const PortraitConfirmedNoteSchema = z
    .object({
        id: z.uuid(),
        topic: PortraitInterviewTopicSchema,
        text: PortraitAnswerSchema,
    })
    .strict();
export type PortraitConfirmedNote = z.infer<typeof PortraitConfirmedNoteSchema>;
export const PortraitItemsSchema = z
    .object({
        languages: z
            .array(
                z
                    .object({
                        language: AssistantLanguageSchema,
                        level: PortraitLanguageLevelSchema.optional(),
                        learning: z.boolean(),
                        clarification: PortraitAnswerSchema.optional(),
                    })
                    .strict(),
            )
            .max(30)
            .default([]),
        explanationLanguages: z
            .array(AssistantLanguageSchema)
            .max(10)
            .default([]),
        mixedLanguage: z.boolean().optional(),
        mixedLanguageFrequency: PortraitMixedLanguageFrequencySchema.optional(),
        mixingNote: PortraitAnswerSchema.optional(),
        notes: z.array(PortraitConfirmedNoteSchema).max(12).optional(),
        goals: z.array(PortraitAnswerSchema).max(12).default([]),
        tone: z.enum(['friendly', 'balanced', 'formal']).optional(),
        detail: z.enum(['concise', 'detailed']).optional(),
        wording: z.enum(['simple', 'balanced', 'academic']).optional(),
        approach: z
            .enum(['examples-first', 'theory-first', 'balanced'])
            .optional(),
        accommodations: z.array(PortraitAnswerSchema).max(12).default([]),
        hobbies: z.array(PortraitAnswerSchema).max(12).default([]),
        ageRange: z
            .enum(['under-18', '18-34', '35-54', '55+', 'prefer-not-to-say'])
            .optional(),
    })
    .strict()
    .superRefine((items, context) => {
        if (portraitSerializedByteLength(items) > PORTRAIT_ITEMS_MAX_BYTES)
            context.addIssue({
                code: 'custom',
                message:
                    'Portrait details exceed the storage limit. Shorten or remove some answers.',
            });
        if (
            items.mixedLanguageFrequency !== undefined &&
            items.mixedLanguage !== undefined &&
            items.mixedLanguage !== (items.mixedLanguageFrequency !== 'avoid')
        )
            context.addIssue({
                code: 'custom',
                path: ['mixedLanguage'],
                message:
                    'Mixed-language settings must agree with the selected frequency.',
            });
        if (
            items.notes &&
            new Set(items.notes.map((note) => note.id.toLowerCase())).size !==
                items.notes.length
        )
            context.addIssue({
                code: 'custom',
                path: ['notes'],
                message: 'Each confirmed note must have a unique identifier.',
            });
        const languages = items.languages.map((item) =>
            item.language.toLowerCase(),
        );
        if (new Set(languages).size !== languages.length)
            context.addIssue({
                code: 'custom',
                path: ['languages'],
                message: 'List each language once.',
            });
        if (
            new Set(
                items.explanationLanguages.map((item) => item.toLowerCase()),
            ).size !== items.explanationLanguages.length
        )
            context.addIssue({
                code: 'custom',
                path: ['explanationLanguages'],
                message: 'List each explanation language once.',
            });
    });
export type PortraitItems = z.infer<typeof PortraitItemsSchema>;
export const PortraitDocumentSchema = z
    .object({
        items: PortraitItemsSchema,
        locale: PortraitLocaleSchema,
        summary: z
            .string()
            .max(PORTRAIT_SUMMARY_MAX_BYTES)
            .refine(
                (summary) =>
                    portraitSerializedByteLength(summary) <=
                    PORTRAIT_SUMMARY_MAX_BYTES,
                'Portrait summary exceeds the storage limit.',
            ),
        updatedAt: z.iso.datetime(),
    })
    .strict();
export type PortraitDocument = z.infer<typeof PortraitDocumentSchema>;
export const PortraitDraftSchema = PortraitDocumentSchema.extend({
    baseApprovedVersion: z.number().int().nonnegative(),
    expiresAt: z.iso.datetime(),
});
export type PortraitDraft = z.infer<typeof PortraitDraftSchema>;
export const PortraitStateSchema = z
    .object({
        version: z.number().int().nonnegative(),
        approvedVersion: z.number().int().nonnegative(),
        generation: z.number().int().nonnegative(),
        useEnabled: z.boolean(),
        approved: PortraitDocumentSchema.nullable(),
        draft: PortraitDraftSchema.nullable(),
    })
    .strict()
    .refine(
        (state) =>
            portraitSerializedByteLength(state) <= PORTRAIT_STATE_MAX_BYTES,
        'Portrait storage limit exceeded. Shorten or remove some answers.',
    );
export type PortraitState = z.infer<typeof PortraitStateSchema>;
export const SavePortraitDraftRequestSchema = z
    .object({
        expectedVersion: z.number().int().nonnegative(),
        baseApprovedVersion: z.number().int().nonnegative(),
        items: PortraitItemsSchema,
        locale: PortraitLocaleSchema,
    })
    .strict();
export type SavePortraitDraftRequest = z.infer<
    typeof SavePortraitDraftRequestSchema
>;
export const ApprovePortraitRequestSchema = z
    .object({
        expectedVersion: z.number().int().nonnegative(),
        expectedApprovedVersion: z.number().int().nonnegative(),
    })
    .strict();
export type ApprovePortraitRequest = z.infer<
    typeof ApprovePortraitRequestSchema
>;
export const SetPortraitUseRequestSchema = z
    .object({
        expectedVersion: z.number().int().nonnegative(),
        enabled: z.boolean(),
    })
    .strict();
export type SetPortraitUseRequest = z.infer<typeof SetPortraitUseRequestSchema>;
export const DeletePortraitRequestSchema = z
    .object({
        expectedVersion: z.number().int().nonnegative(),
        confirmed: z.literal(true),
    })
    .strict();
export type DeletePortraitRequest = z.infer<typeof DeletePortraitRequestSchema>;
export const PortraitInterviewerOutputSchema = z
    .object({
        message: portraitTextSchema(3000).min(1),
        locale: PortraitLocaleSchema.optional(),
        topic: PortraitInterviewTopicSchema,
        options: z
            .array(
                z
                    .object({
                        id: z.string().regex(/^[a-z0-9-]{1,60}$/),
                        label: PortraitAnswerSchema,
                    })
                    .strict(),
            )
            .max(12)
            .refine(
                (options) =>
                    new Set(options.map((option) => option.id)).size ===
                    options.length,
                'Question option identifiers must be unique.',
            ),
        multiSelect: z.boolean(),
        proposedItems: PortraitItemsSchema.optional(),
        answerSummary: PortraitAnswerSchema.optional(),
        redirect: z.literal('/knowledge').optional(),
    })
    .strict();
export type PortraitInterviewerOutput = z.infer<
    typeof PortraitInterviewerOutputSchema
>;

export const DiscardPortraitInterviewRequestSchema = z
    .object({ expectedVersion: z.number().int().nonnegative() })
    .strict();
export type DiscardPortraitInterviewRequest = z.infer<
    typeof DiscardPortraitInterviewRequestSchema
>;
