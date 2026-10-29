import { z } from 'zod';
import {
    DictionaryImportTargetSchema,
    DictionaryDeterministicImportResponseSchema,
} from './dictionaries/interchange';
import {
    TextLanguageSchema,
    TextTitleSchema,
    TextSchema,
    TextSourceSchema,
    TextAlignmentSchema,
} from './texts';

export const KnowledgeLibraryWorkingSourceSchema = z
    .object({
        branchId: z.uuid(),
        expectedVersion: z.number().int().positive(),
    })
    .strict();
export type KnowledgeLibraryWorkingSource = z.infer<
    typeof KnowledgeLibraryWorkingSourceSchema
>;

const source = {
    noteId: z.uuid(),
    noteVersion: z.number().int().positive().optional(),
    workingSource: KnowledgeLibraryWorkingSourceSchema.optional(),
    blockId: z.uuid(),
};
function validateSource(
    value: {
        noteVersion?: number | undefined;
        workingSource?:
            { branchId: string; expectedVersion: number } | undefined;
    },
    context: z.RefinementCtx,
) {
    if (
        (value.noteVersion !== undefined) ===
        (value.workingSource !== undefined)
    )
        context.addIssue({
            code: 'custom',
            path: ['workingSource'],
            message: 'Choose exactly one saved or owned working source.',
        });
}

export const CopyKnowledgeVocabularyRequestSchema = z
    .object({
        operationId: z.uuid(),
        ...source,
        entryIds: z
            .array(z.uuid())
            .min(1)
            .max(200)
            .refine(
                (ids) => new Set(ids).size === ids.length,
                'Selected entries must be unique.',
            ),
        destination: DictionaryImportTargetSchema,
    })
    .strict()
    .superRefine(validateSource);
export const KnowledgeVocabularyPreviewSchema = z
    .object({
        entries: z
            .array(
                z
                    .object({
                        id: z.uuid(),
                        term: z.string().max(500),
                        translation: z.string().max(2000),
                        pronunciation: z.string().max(500).optional(),
                        definition: z.string().max(2000).optional(),
                        example: z.string().max(2000).optional(),
                        exampleTranslation: z.string().max(2000).optional(),
                    })
                    .strict(),
            )
            .min(1)
            .max(200),
        remainingRows: z.number().int().nonnegative(),
    })
    .strict();
export const CopyKnowledgeVocabularyResponseSchema =
    DictionaryDeterministicImportResponseSchema;
export const CopyKnowledgeTextRequestSchema = z
    .object({
        operationId: z.uuid(),
        ...source,
        translationLanguage: TextLanguageSchema,
        privateTranslation: z
            .object({
                sourceFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
                updatedAt: z.iso.datetime(),
            })
            .strict()
            .optional(),
        destination: z.discriminatedUnion('kind', [
            z
                .object({ kind: z.literal('new'), title: TextTitleSchema })
                .strict(),
            z
                .object({
                    kind: z.literal('existing'),
                    textId: z.uuid(),
                    expectedVersion: z.number().int().positive(),
                })
                .strict(),
        ]),
    })
    .strict()
    .superRefine((value, context) => {
        validateSource(value, context);
        if (value.workingSource && value.privateTranslation)
            context.addIssue({
                code: 'custom',
                path: ['privateTranslation'],
                message: 'Private translation receipts require a saved source.',
            });
    });
export const KnowledgeTextLibraryPreviewSchema = z
    .object({
        text: z
            .object({
                title: TextTitleSchema,
                sourceLanguage: TextLanguageSchema,
                targetLanguage: TextLanguageSchema,
                sourceText: TextSourceSchema,
                alignment: TextAlignmentSchema.nullable(),
            })
            .strict(),
        isNew: z.boolean(),
    })
    .strict();
export const CopyKnowledgeTextResponseSchema = z
    .object({ text: TextSchema })
    .strict();
export type CopyKnowledgeVocabularyRequest = z.infer<
    typeof CopyKnowledgeVocabularyRequestSchema
>;
export type CopyKnowledgeTextRequest = z.infer<
    typeof CopyKnowledgeTextRequestSchema
>;
export type KnowledgeVocabularyPreview = z.infer<
    typeof KnowledgeVocabularyPreviewSchema
>;
export type KnowledgeTextLibraryPreview = z.infer<
    typeof KnowledgeTextLibraryPreviewSchema
>;
