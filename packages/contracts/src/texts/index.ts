import { SUPPORTED_LANGUAGE_TAGS } from '@languon/languages';
import { z } from 'zod';

export const textLimits = {
    sourceCodePoints: 20_000,
    translationCodePoints: 80_000,
    selectionCodePoints: 200,
    titleCodePoints: 200,
} as const;
function plainText(max: number, nonblank = false, trim = false) {
    return (trim ? z.string().trim() : z.string()).superRefine((value, ctx) => {
        if (
            Array.from(value).length > max ||
            (nonblank && !value.trim()) ||
            Array.from(value).some((character) => {
                const point = character.codePointAt(0)!;
                return (
                    point <= 8 ||
                    point === 11 ||
                    point === 12 ||
                    (point >= 14 && point <= 31) ||
                    (point >= 127 && point <= 159) ||
                    (point >= 0xd800 && point <= 0xdfff)
                );
            })
        ) {
            ctx.addIssue({
                code: 'custom',
                message:
                    'Text is blank, too long, or contains unsupported characters',
            });
        }
    });
}
export const TextIdSchema = z.uuid();
export const TextLanguageSchema = z.enum(SUPPORTED_LANGUAGE_TAGS);
export const TextSourceSchema = plainText(textLimits.sourceCodePoints, true);
export const TextTitleSchema = plainText(
    textLimits.titleCodePoints,
    true,
    true,
);
export const TextVersionSchema = z.number().int().positive();
export const TextLifecycleSchema = z.enum(['active', 'archived']);
const Timestamp = z.iso.datetime({ offset: true });
const Cursor = TextIdSchema;
export const TextSourceSegmentSchema = z
    .object({
        pairId: TextIdSchema,
        text: TextSourceSchema,
        startOffset: z.number().int().nonnegative(),
        endOffset: z.number().int().positive(),
        paragraphIndex: z.number().int().nonnegative(),
    })
    .strict();
export const TextTranslationSegmentSchema = z
    .object({
        pairId: TextIdSchema,
        text: plainText(textLimits.translationCodePoints, true),
    })
    .strict();
export const TextAlignmentSchema = z
    .object({
        source: z.array(TextSourceSegmentSchema).min(1).max(20_000),
        translation: z.array(TextTranslationSegmentSchema).min(1).max(20_000),
        editedPairIds: z.array(TextIdSchema).max(20_000),
    })
    .strict()
    .superRefine((value, ctx) => {
        const ids = new Set(value.source.map((s) => s.pairId));
        if (
            ids.size !== value.source.length ||
            value.source.length !== value.translation.length ||
            value.translation.some(
                (s, i) => s.pairId !== value.source[i]?.pairId,
            ) ||
            new Set(value.editedPairIds).size !== value.editedPairIds.length ||
            value.editedPairIds.some((id) => !ids.has(id))
        )
            ctx.addIssue({
                code: 'custom',
                message: 'Sentence pairs must be unique, ordered, and complete',
            });
        let offset = 0;
        for (const segment of value.source) {
            if (
                segment.startOffset !== offset ||
                segment.endOffset !== offset + segment.text.length
            )
                ctx.addIssue({
                    code: 'custom',
                    message: 'Source offsets must reconstruct the exact text',
                });
            offset += segment.text.length;
        }
        if (
            Array.from(value.source.map((s) => s.text).join('')).length >
                textLimits.sourceCodePoints ||
            Array.from(value.translation.map((s) => s.text).join('')).length >
                textLimits.translationCodePoints
        )
            ctx.addIssue({
                code: 'custom',
                message: 'Aligned content exceeds the text limit',
            });
    });
const FolderFields = {
    id: TextIdSchema,
    name: plainText(120, true, true),
    description: plainText(2_000, false, true).nullable(),
    lifecycle: TextLifecycleSchema,
    version: TextVersionSchema,
    createdAt: Timestamp,
    updatedAt: Timestamp,
};
export const TextFolderSchema = z
    .object({
        ...FolderFields,
        textCount: z.number().int().nonnegative().optional(),
        translatedCount: z.number().int().nonnegative().optional(),
        isShared: z.boolean().optional(),
    })
    .strict();
export const TextSchema = z
    .object({
        id: TextIdSchema,
        folderId: TextIdSchema,
        isShared: z.boolean().optional(),
        title: TextTitleSchema,
        sourceLanguage: TextLanguageSchema,
        targetLanguage: TextLanguageSchema,
        sourceText: TextSourceSchema,
        alignment: TextAlignmentSchema.nullable(),
        status: z.enum(['draft', 'translated', 'edited']),
        lifecycle: TextLifecycleSchema,
        version: TextVersionSchema,
        createdAt: Timestamp,
        updatedAt: Timestamp,
    })
    .strict()
    .superRefine((value, ctx) => {
        if (value.sourceLanguage === value.targetLanguage)
            ctx.addIssue({ code: 'custom', message: 'Languages must differ' });
        if (
            value.alignment &&
            value.alignment.source.map((s) => s.text).join('') !==
                value.sourceText
        )
            ctx.addIssue({
                code: 'custom',
                message: 'Alignment must preserve source text',
            });
        const status = !value.alignment
            ? 'draft'
            : value.alignment.editedPairIds.length
              ? 'edited'
              : 'translated';
        if (status !== value.status)
            ctx.addIssue({
                code: 'custom',
                message: 'Status must match saved provenance',
            });
    });
export const CreateTextFolderRequestSchema = z
    .object({
        name: FolderFields.name,
        description: FolderFields.description.default(null),
    })
    .strict();
export const UpdateTextFolderRequestSchema = z
    .object({
        expectedVersion: TextVersionSchema,
        name: FolderFields.name.optional(),
        description: FolderFields.description.optional(),
    })
    .strict()
    .refine(
        (v) => v.name !== undefined || v.description !== undefined,
        'At least one change is required',
    );
export const TextVersionRequestSchema = z
    .object({ expectedVersion: TextVersionSchema })
    .strict();
const ContentFields = {
    sourceText: TextSourceSchema,
    sourceLanguage: TextLanguageSchema,
    targetLanguage: TextLanguageSchema,
};
const differentLanguages = (v: {
    sourceLanguage: string;
    targetLanguage: string;
}) => v.sourceLanguage !== v.targetLanguage;
export const CreateTextRequestSchema = z
    .object({
        folderId: TextIdSchema,
        operationId: TextIdSchema.optional(),
        title: TextTitleSchema.optional(),
        ...ContentFields,
    })
    .strict()
    .refine(differentLanguages, 'Languages must differ');
export const TextPairEditSchema = z
    .object({
        pairId: TextIdSchema,
        source: TextSourceSchema,
        translation: plainText(textLimits.translationCodePoints, true),
    })
    .strict();
export const TextPairEditsSchema = z
    .array(TextPairEditSchema)
    .min(1)
    .max(20_000)
    .superRefine((pairs, ctx) => {
        if (
            new Set(pairs.map((pair) => pair.pairId)).size !== pairs.length ||
            Array.from(pairs.map((pair) => pair.source).join('')).length >
                textLimits.sourceCodePoints ||
            Array.from(pairs.map((pair) => pair.translation).join('')).length >
                textLimits.translationCodePoints
        )
            ctx.addIssue({
                code: 'custom',
                message:
                    'Edited pairs must be unique and within the total text limits',
            });
    });
export const SaveTextRequestSchema = z.discriminatedUnion('kind', [
    z
        .object({
            kind: z.literal('draft'),
            expectedVersion: TextVersionSchema,
            title: TextTitleSchema.optional(),
            ...ContentFields,
        })
        .strict()
        .refine(differentLanguages, 'Languages must differ'),
    z
        .object({
            kind: z.literal('proposal'),
            expectedVersion: TextVersionSchema,
            jobId: TextIdSchema,
            title: TextTitleSchema.optional(),
        })
        .strict(),
    z
        .object({
            kind: z.literal('edits'),
            expectedVersion: TextVersionSchema,
            title: TextTitleSchema.optional(),
            pairs: TextPairEditsSchema,
        })
        .strict(),
    z
        .object({
            kind: z.literal('metadata'),
            expectedVersion: TextVersionSchema,
            title: TextTitleSchema,
        })
        .strict(),
]);
export const ListTextFoldersQuerySchema = z
    .object({
        cursor: Cursor.optional(),
        limit: z.coerce.number().int().min(1).max(100).default(25),
        lifecycle: TextLifecycleSchema.default('active'),
    })
    .strict();
export const ListTextsQuerySchema = ListTextFoldersQuerySchema;
export const ListTextFoldersResponseSchema = z
    .object({
        data: z.array(TextFolderSchema).max(100),
        nextCursor: Cursor.nullable(),
    })
    .strict();
export const ListTextsResponseSchema = z
    .object({
        data: z.array(TextSchema).max(100),
        nextCursor: Cursor.nullable(),
    })
    .strict();
export const TextResponseSchema = z.object({ text: TextSchema }).strict();
export const TextFolderResponseSchema = z
    .object({ folder: TextFolderSchema })
    .strict();
export const TextIdParamsSchema = z.object({ textId: TextIdSchema }).strict();
export const TextFolderIdParamsSchema = z
    .object({ folderId: TextIdSchema })
    .strict();
export const TextJobIdParamsSchema = z.object({ jobId: TextIdSchema }).strict();
export const EnqueueTextDetectionRequestSchema = z
    .object({
        folderId: TextIdSchema,
        sourceText: TextSourceSchema,
        operationId: TextIdSchema,
    })
    .strict();
export const EnqueueTextTranslationRequestSchema = z
    .object({
        folderId: TextIdSchema,
        ...ContentFields,
        operationId: TextIdSchema,
        textId: TextIdSchema.optional(),
        expectedTextVersion: TextVersionSchema.optional(),
    })
    .strict()
    .refine(differentLanguages, 'Languages must differ')
    .refine(
        (v) =>
            (v.textId === undefined) === (v.expectedTextVersion === undefined),
        'Text identity and expected version must be supplied together',
    );
export const TextDetectionResultSchema = z
    .object({
        language: TextLanguageSchema.nullable(),
        confidence: z.enum(['high', 'low', 'unknown']),
    })
    .strict()
    .refine(
        (value) =>
            (value.language === null) === (value.confidence === 'unknown'),
        'Unknown language requires unknown confidence',
    );
export const TextTranslationProposalSchema = z
    .object({
        id: TextIdSchema,
        ...ContentFields,
        alignment: TextAlignmentSchema,
        textId: TextIdSchema.nullable(),
        expectedTextVersion: TextVersionSchema.nullable(),
    })
    .strict()
    .superRefine((v, ctx) => {
        if (
            !differentLanguages(v) ||
            v.alignment.source.map((s) => s.text).join('') !== v.sourceText ||
            v.alignment.editedPairIds.length ||
            (v.textId === null) !== (v.expectedTextVersion === null)
        )
            ctx.addIssue({
                code: 'custom',
                message: 'Invalid translation proposal provenance',
            });
    });
export const TextAiJobSchema = z
    .object({
        id: TextIdSchema,
        kind: z.enum(['text-detection', 'text-translation']),
        state: z.enum([
            'queued',
            'running',
            'completed',
            'failed',
            'cancelled',
        ]),
        failureCode: z.string().min(1).max(100).nullable(),
        result: z
            .union([TextDetectionResultSchema, TextTranslationProposalSchema])
            .nullable(),
        createdAt: Timestamp,
        completedAt: Timestamp.nullable(),
    })
    .strict()
    .superRefine((job, ctx) => {
        const terminal = ['completed', 'failed', 'cancelled'].includes(
            job.state,
        );
        const validResult =
            job.kind === 'text-detection'
                ? TextDetectionResultSchema.safeParse(job.result).success
                : TextTranslationProposalSchema.safeParse(job.result).success;
        if (
            terminal !== (job.completedAt !== null) ||
            (job.state === 'completed' ? !validResult : job.result !== null) ||
            (job.state === 'failed') !== (job.failureCode !== null) ||
            (job.kind === 'text-translation' &&
                job.result &&
                'id' in job.result &&
                job.result.id !== job.id)
        )
            ctx.addIssue({
                code: 'custom',
                message: 'Job state and result are inconsistent',
            });
    });
export const TextAiJobResponseSchema = z
    .object({ job: TextAiJobSchema })
    .strict();
export const TextShareIdSchema = z
    .string()
    .min(16)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/);
export const TextShareKeySchema = z
    .string()
    .min(43)
    .max(128)
    .regex(/^[A-Za-z0-9_-]+$/);
export const TextShareKeyHeadersSchema = z
    .object({ 'x-languon-share-key': TextShareKeySchema })
    .passthrough();
export const TextShareParamsSchema = z
    .object({ shareId: TextShareIdSchema })
    .strict();
export const TextShareCapabilitySchema = z
    .object({ shareId: TextShareIdSchema, key: TextShareKeySchema })
    .strict();
export const TextShareResponseSchema = z
    .object({ capability: TextShareCapabilitySchema })
    .strict();
export const CopySharedTextRequestSchema = z
    .object({
        folderId: TextIdSchema.optional(),
        newFolderName: plainText(120, true, true).optional(),
        expectedVersion: TextVersionSchema,
        operationId: TextIdSchema,
    })
    .strict()
    .refine(
        (value) =>
            (value.folderId !== undefined) !==
            (value.newFolderName !== undefined),
        { message: 'Choose exactly one destination folder' },
    );
export const CopySharedTextFolderRequestSchema = z
    .object({
        operationId: TextIdSchema,
        newFolderName: plainText(120, true, true).optional(),
    })
    .strict();
export const TextSelectionSourceSchema = z.discriminatedUnion('kind', [
    z
        .object({
            kind: z.literal('owned-text'),
            textId: TextIdSchema,
            expectedTextVersion: TextVersionSchema,
        })
        .strict(),
    z
        .object({
            kind: z.literal('shared-text'),
            shareId: TextShareIdSchema,
            textId: TextIdSchema,
            expectedTextVersion: TextVersionSchema,
        })
        .strict(),
    z
        .object({
            kind: z.literal('translation-proposal'),
            jobId: TextIdSchema,
        })
        .strict(),
]);
export const TextSelectionTargetSchema = z.discriminatedUnion('kind', [
    z
        .object({
            kind: z.literal('existing'),
            dictionaryId: TextIdSchema,
            expectedDictionaryVersion: TextVersionSchema,
            expectedSettingsVersion: TextVersionSchema,
        })
        .strict(),
    z.object({ kind: z.literal('new'), name: FolderFields.name }).strict(),
]);
export const TextSelectionSchema = z
    .object({
        side: z.enum(['source', 'translation']),
        pairId: TextIdSchema,
        startOffset: z.number().int().nonnegative(),
        endOffset: z.number().int().positive(),
    })
    .strict()
    .refine((v) => v.endOffset > v.startOffset, 'Selection must be nonempty');
export const EnqueueTextSelectionRequestSchema = z
    .object({
        operationId: TextIdSchema,
        source: TextSelectionSourceSchema,
        selection: TextSelectionSchema,
        target: TextSelectionTargetSchema,
        confirmDuplicate: z.boolean().default(false),
    })
    .strict();
export const TextErrorCodeSchema = z.enum([
    'authentication_required',
    'text_not_found',
    'folder_not_found',
    'shared_text_not_found',
    'generation_job_not_found',
    'invalid_request',
    'model_capacity_exceeded',
    'invalid_alignment',
    'invalid_selection',
    'version_conflict',
    'idempotency_conflict',
    'generation_not_available',
    'generation_proposal_expired',
    'generation_not_reviewable',
    'ai_credits_exhausted',
    'rate_limited',
    'service_unavailable',
    'internal_error',
]);
export const TextErrorResponseSchema = z
    .object({
        error: z
            .object({
                code: TextErrorCodeSchema,
                message: z.string().min(1).max(300),
                correlationId: z.string().min(1).max(128),
                retryAfterSeconds: z
                    .number()
                    .int()
                    .positive()
                    .max(86_400)
                    .optional(),
            })
            .strict(),
    })
    .strict();
export type TextFolder = z.infer<typeof TextFolderSchema>;
export type TextDocument = z.infer<typeof TextSchema>;
export type TextAlignment = z.infer<typeof TextAlignmentSchema>;
export type TextSourceSegment = z.infer<typeof TextSourceSegmentSchema>;
export type TextTranslationSegment = z.infer<
    typeof TextTranslationSegmentSchema
>;
export type TextPairEdit = z.infer<typeof TextPairEditSchema>;
export type CreateTextFolderRequest = z.infer<
    typeof CreateTextFolderRequestSchema
>;
export type UpdateTextFolderRequest = z.infer<
    typeof UpdateTextFolderRequestSchema
>;
export type CreateTextRequest = z.infer<typeof CreateTextRequestSchema>;
export type SaveTextRequest = z.infer<typeof SaveTextRequestSchema>;
export type ListTextFoldersQuery = z.infer<typeof ListTextFoldersQuerySchema>;
export type ListTextsQuery = z.infer<typeof ListTextsQuerySchema>;
export type EnqueueTextDetectionRequest = z.infer<
    typeof EnqueueTextDetectionRequestSchema
>;
export type EnqueueTextTranslationRequest = z.infer<
    typeof EnqueueTextTranslationRequestSchema
>;
export type TextDetectionResult = z.infer<typeof TextDetectionResultSchema>;
export type TextTranslationProposal = z.infer<
    typeof TextTranslationProposalSchema
>;
export type TextAiJob = z.infer<typeof TextAiJobSchema>;
export type TextSelectionSource = z.infer<typeof TextSelectionSourceSchema>;
export type TextSelectionTarget = z.infer<typeof TextSelectionTargetSchema>;
export type TextSelection = z.infer<typeof TextSelectionSchema>;
export type TextSelectionRequest = z.infer<
    typeof EnqueueTextSelectionRequestSchema
>;
export type TextErrorCode = z.infer<typeof TextErrorCodeSchema>;

export const TextSelectionJobSchema = z
    .object({
        id: TextIdSchema,
        state: z.enum([
            'queued',
            'running',
            'completed',
            'failed',
            'cancelled',
        ]),
        failureCode: z.string().min(1).max(100).nullable(),
        dictionaryId: TextIdSchema.nullable(),
        cardId: TextIdSchema.nullable(),
        createdAt: Timestamp,
        updatedAt: Timestamp,
    })
    .strict();
export const TextSelectionJobResponseSchema = z
    .object({ job: TextSelectionJobSchema })
    .strict();
export type TextSelectionJob = z.infer<typeof TextSelectionJobSchema>;

export const SharedTextResponseSchema = z
    .object({
        folder: TextFolderSchema.nullable(),
        texts: z.array(TextSchema).max(100),
        nextCursor: Cursor.nullable(),
    })
    .strict();
export type SharedTextResponse = z.infer<typeof SharedTextResponseSchema>;
