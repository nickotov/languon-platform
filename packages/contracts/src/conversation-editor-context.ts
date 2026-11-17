import { z } from 'zod';

const editorText = z
    .string()
    .max(160_000)
    .refine(
        (value) => Array.from(value).length <= 80_000,
        'Text exceeds 80,000 characters.',
    )
    .refine(
        (value) => !/[\uD800-\uDFFF]/u.test(value) && !value.includes('\u0000'),
    );

/** UTF-16 offsets in the exact plain editor snapshot sent with a turn. */
export const ConversationEditorAnchorSchema = z
    .object({
        from: z.number().int().nonnegative(),
        to: z.number().int().nonnegative(),
        originalText: editorText,
        documentHash: z.string().regex(/^[a-f0-9]{64}$/u),
    })
    .strict();

export const ConversationEditorTargetSchema =
    ConversationEditorAnchorSchema.extend({
        proposalMode: z.enum(['insert', 'append', 'replace']).optional(),
    }).strict();

export const ConversationEditorContextSchema = z
    .object({
        content: editorText,
        selectedText: editorText.optional(),
        workingBranch: z
            .object({ id: z.uuid(), version: z.number().int().positive() })
            .strict()
            .optional(),
        editorTarget: ConversationEditorAnchorSchema,
        proposalTarget: ConversationEditorAnchorSchema.extend({
            mode: z.enum(['insert', 'append', 'replace']),
        })
            .strict()
            .optional(),
    })
    .strict();

export type ConversationEditorContext = z.infer<
    typeof ConversationEditorContextSchema
>;
export type ConversationEditorTarget = z.infer<
    typeof ConversationEditorTargetSchema
>;
