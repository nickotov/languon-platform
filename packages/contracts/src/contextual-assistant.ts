import { z } from 'zod';

const validAssistantText = (value: string) =>
    !/[\uD800-\uDFFF]/u.test(value) && !value.includes('\u0000');

export const KnowledgeCategorySchema = z.enum([
    'grammar',
    'vocabulary',
    'usage',
    'pronunciation',
    'etymology',
    'culture',
    'learning-tips',
]);
export const AssistantLanguageSchema = z
    .string()
    .trim()
    .min(2)
    .max(35)
    .regex(/^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u);
export const KnowledgeLinkSchema = z
    .string()
    .max(2_048)
    .refine((value) => {
        try {
            const url = new URL(value);
            return (
                /^https?:\/\//iu.test(value) &&
                !Array.from(value).some(
                    (character) =>
                        character.charCodeAt(0) <= 32 ||
                        character.charCodeAt(0) === 127,
                ) &&
                !url.username &&
                !url.password
            );
        } catch {
            return false;
        }
    }, 'Links must use an absolute HTTP or HTTPS URL without credentials.');
export const KnowledgeMarkSchema = z.discriminatedUnion('type', [
    z.object({ type: z.literal('bold') }).strict(),
    z.object({ type: z.literal('italic') }).strict(),
    z.object({ type: z.literal('strike') }).strict(),
    z.object({ type: z.literal('underline') }).strict(),
    z.object({ type: z.literal('code') }).strict(),
    z
        .object({
            type: z.literal('link'),
            attrs: z
                .object({
                    href: KnowledgeLinkSchema,
                    target: z.literal('_blank').nullable().optional(),
                    rel: z.string().max(80).nullable().optional(),
                    class: z.null().optional(),
                })
                .strict(),
        })
        .strict(),
]);
export type KnowledgeMark = z.infer<typeof KnowledgeMarkSchema>;
export interface KnowledgeNode {
    type:
        | 'doc'
        | 'paragraph'
        | 'heading'
        | 'bulletList'
        | 'orderedList'
        | 'listItem'
        | 'blockquote'
        | 'table'
        | 'tableRow'
        | 'tableCell'
        | 'tableHeader'
        | 'hardBreak'
        | 'text';
    text?: string | undefined;
    attrs?:
        | {
              level?: 2 | 3 | undefined;
              start?: number | undefined;
              colspan?: 1 | undefined;
              rowspan?: 1 | undefined;
              colwidth?: null | undefined;
          }
        | undefined;
    marks?: KnowledgeMark[] | undefined;
    content?: KnowledgeNode[] | undefined;
}
const RawKnowledgeNodeSchema: z.ZodType<KnowledgeNode> = z.lazy(() =>
    z
        .object({
            type: z.enum([
                'doc',
                'paragraph',
                'heading',
                'bulletList',
                'orderedList',
                'listItem',
                'blockquote',
                'table',
                'tableRow',
                'tableCell',
                'tableHeader',
                'hardBreak',
                'text',
            ]),
            text: z
                .string()
                .min(1)
                .max(80_000)
                .refine(
                    (text) =>
                        !/[\uD800-\uDFFF]/u.test(text) &&
                        !text.includes('\u0000'),
                    'Text must contain valid Unicode and no null characters.',
                )
                .optional(),
            attrs: z
                .object({
                    level: z.union([z.literal(2), z.literal(3)]).optional(),
                    start: z.number().int().min(1).max(10_000).optional(),
                    colspan: z.literal(1).optional(),
                    rowspan: z.literal(1).optional(),
                    colwidth: z.null().optional(),
                })
                .strict()
                .optional(),
            marks: z.array(KnowledgeMarkSchema).max(5).optional(),
            content: z.array(RawKnowledgeNodeSchema).max(5_000).optional(),
        })
        .strict(),
);

/** Bound recursion before recursive schema parsing; reject oversized structures without truncation. */
const BoundedDocumentSchema = z
    .unknown()
    .superRefine((value, ctx) => {
        const pending: { value: unknown; depth: number }[] = [
            { value, depth: 0 },
        ];
        let count = 0;
        let textLength = 0;
        while (pending.length) {
            const current = pending.pop()!;
            if (++count > 5_000 || current.depth > 12) {
                ctx.addIssue({
                    code: 'custom',
                    message: 'The document exceeds its node or depth limit.',
                });
                return;
            }
            if (!current.value || typeof current.value !== 'object') continue;
            const node = current.value as Record<string, unknown>;
            if (typeof node.text === 'string') textLength += node.text.length;
            if (textLength > 80_000) {
                ctx.addIssue({
                    code: 'custom',
                    message: 'The document exceeds 80000 characters.',
                });
                return;
            }
            if (Array.isArray(node.content)) {
                if (node.content.length > 5_000) {
                    ctx.addIssue({
                        code: 'custom',
                        message: 'The document exceeds its node limit.',
                    });
                    return;
                }
                for (const child of node.content)
                    pending.push({ value: child, depth: current.depth + 1 });
            }
        }
    })
    .pipe(RawKnowledgeNodeSchema)
    .superRefine((document, ctx) => {
        const issue = (message: string) =>
            ctx.addIssue({ code: 'custom', message });
        if (document.type !== 'doc') issue('The document root must be doc.');
        const blocks = new Set([
            'paragraph',
            'heading',
            'bulletList',
            'orderedList',
            'blockquote',
            'table',
        ]);
        const visit = (node: KnowledgeNode, inTable = false) => {
            if (node.type === 'table' && inTable)
                issue('Nested tables are not supported.');
            const children = node.content ?? [];
            const attrs = Object.keys(node.attrs ?? {});
            const allowedAttrs =
                node.type === 'heading'
                    ? ['level']
                    : node.type === 'orderedList'
                      ? ['start']
                      : ['tableCell', 'tableHeader'].includes(node.type)
                        ? ['colspan', 'rowspan', 'colwidth']
                        : [];
            if (attrs.some((key) => !allowedAttrs.includes(key)))
                issue('Attributes do not match the node type.');
            if (node.type !== 'text' && node.text !== undefined)
                issue('Only text nodes contain text.');
            if (node.type !== 'text' && node.marks?.length)
                issue('Only text nodes contain marks.');
            if (
                node.marks?.some((mark) => mark.type === 'code') &&
                node.marks.length !== 1
            )
                issue('Code marks cannot be combined with other marks.');
            if (
                node.marks &&
                new Set(node.marks.map((mark) => mark.type)).size !==
                    node.marks.length
            )
                issue('Marks must not be repeated.');
            if (
                node.type === 'text' &&
                (!node.text || node.content !== undefined)
            )
                issue('Text nodes require text and no child nodes.');
            if (node.type === 'hardBreak' && node.content !== undefined)
                issue('Line breaks cannot contain child nodes.');
            if (node.type === 'heading' && node.attrs?.level === undefined)
                issue('A heading requires level 2 or 3.');
            if (
                ['paragraph', 'heading'].includes(node.type) &&
                children.some(
                    (child) => !['text', 'hardBreak'].includes(child.type),
                )
            )
                issue('Paragraphs and headings contain only inline text.');
            if (
                [
                    'doc',
                    'blockquote',
                    'listItem',
                    'tableCell',
                    'tableHeader',
                ].includes(node.type)
            ) {
                if (
                    !children.length ||
                    children.some((child) => !blocks.has(child.type))
                )
                    issue('A block container requires block children.');
                if (
                    ['listItem', 'tableCell', 'tableHeader'].includes(
                        node.type,
                    ) &&
                    children[0]?.type !== 'paragraph'
                )
                    issue('Lists and cells start with a paragraph.');
                if (
                    ['tableCell', 'tableHeader'].includes(node.type) &&
                    children.some((child) => child.type === 'table')
                )
                    issue('Nested tables are not supported.');
            }
            if (
                ['bulletList', 'orderedList'].includes(node.type) &&
                (!children.length ||
                    children.some((child) => child.type !== 'listItem'))
            )
                issue('Lists require list items.');
            if (node.type === 'table') {
                const width = children[0]?.content?.length ?? 0;
                if (
                    !children.length ||
                    children.length > 20 ||
                    width < 1 ||
                    width > 8 ||
                    children.some(
                        (row) =>
                            row.type !== 'tableRow' ||
                            row.content?.length !== width,
                    )
                )
                    issue(
                        'Tables must be rectangular and at most 20 rows by 8 columns.',
                    );
            }
            if (
                node.type === 'tableRow' &&
                (!children.length ||
                    children.some(
                        (child) =>
                            !['tableCell', 'tableHeader'].includes(child.type),
                    ))
            )
                issue('Table rows require cells.');
            children.forEach((child) =>
                visit(child, inTable || node.type === 'table'),
            );
        };
        visit(document);
    });
export const KnowledgeBodySchema = z
    .object({ schemaVersion: z.literal(1), document: BoundedDocumentSchema })
    .strict();
export type KnowledgeBody = z.infer<typeof KnowledgeBodySchema>;
export const KnowledgeNoteContentSchema = z
    .object({
        title: z
            .string()
            .trim()
            .min(1)
            .max(200)
            .refine(
                (text) =>
                    !/[\uD800-\uDFFF]/u.test(text) && !text.includes('\u0000'),
            ),
        summary: z
            .string()
            .trim()
            .min(1)
            .max(1_000)
            .refine(
                (text) =>
                    !/[\uD800-\uDFFF]/u.test(text) && !text.includes('\u0000'),
            ),
        body: KnowledgeBodySchema,
        categories: z
            .array(KnowledgeCategorySchema)
            .min(1)
            .max(7)
            .refine(
                (items) => new Set(items).size === items.length,
                'Categories must be unique.',
            ),
        studiedLanguage: AssistantLanguageSchema,
        explanationLanguage: AssistantLanguageSchema,
    })
    .strict();
export const KnowledgeNoteSchema = KnowledgeNoteContentSchema.extend({
    id: z.uuid(),
    version: z.number().int().positive(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
});
export const KnowledgeNoteRevisionSchema = z
    .object({
        noteId: z.uuid(),
        version: z.number().int().positive(),
        content: KnowledgeNoteContentSchema,
        createdAt: z.iso.datetime(),
    })
    .strict();
export const KnowledgeDraftSchema = z
    .object({
        id: z.uuid(),
        conversationId: z.uuid(),
        version: z.number().int().positive(),
        targetNoteId: z.uuid().nullable(),
        expectedNoteVersion: z.number().int().positive().nullable(),
        content: KnowledgeNoteContentSchema,
        createdAt: z.iso.datetime(),
        updatedAt: z.iso.datetime(),
    })
    .strict()
    .refine(
        (draft) =>
            (draft.targetNoteId === null) ===
            (draft.expectedNoteVersion === null),
        'An update draft must include its target revision.',
    );
export const KnowledgeNoteIdParamsSchema = z.object({ noteId: z.uuid() });
export const ListKnowledgeQuerySchema = z
    .object({
        q: z.string().trim().max(200).optional(),
        category: KnowledgeCategorySchema.optional(),
        studiedLanguage: AssistantLanguageSchema.optional(),
        offset: z.coerce.number().int().min(0).max(100_000).default(0),
        limit: z.coerce.number().int().min(1).max(100).default(20),
    })
    .strict();
export const CreateKnowledgeNoteRequestSchema = z
    .object({ operationId: z.uuid(), content: KnowledgeNoteContentSchema })
    .strict();
export const UpdateKnowledgeNoteRequestSchema =
    CreateKnowledgeNoteRequestSchema.extend({
        expectedVersion: z.number().int().positive(),
    });
export const DeleteKnowledgeNoteRequestSchema = z
    .object({
        operationId: z.uuid(),
        expectedVersion: z.number().int().positive(),
    })
    .strict();
export const RestoreKnowledgeNoteRequestSchema =
    DeleteKnowledgeNoteRequestSchema.extend({
        revisionVersion: z.number().int().positive(),
    });
export const KnowledgeNoteResponseSchema = z.object({
    note: KnowledgeNoteSchema,
});
export const ListKnowledgeResponseSchema = z.object({
    notes: z.array(KnowledgeNoteSchema),
    total: z.number().int().nonnegative(),
    offset: z.number().int().nonnegative(),
    limit: z.number().int().positive(),
});
export const KnowledgeRevisionsResponseSchema = z.object({
    revisions: z.array(KnowledgeNoteRevisionSchema),
});
export const KnowledgeDeletedResponseSchema = z.object({
    deleted: z.literal(true),
});
export const KnowledgeErrorCodeSchema = z.enum([
    'invalid_request',
    'authentication_required',
    'invalid_origin',
    'knowledge_not_found',
    'version_conflict',
    'idempotency_conflict',
    'deletion_busy',
    'rate_limited',
    'service_unavailable',
    'internal_error',
]);
export const KnowledgeErrorResponseSchema = z.object({
    error: z.object({
        code: KnowledgeErrorCodeSchema,
        message: z.string(),
        correlationId: z.string(),
    }),
});

export const ChatPreferencesSchema = z
    .object({
        replyLanguage: z
            .union([z.literal('auto'), AssistantLanguageSchema])
            .default('auto'),
        tone: z
            .enum(['neutral', 'conversational', 'academic'])
            .default('neutral'),
        explanationLevel: z
            .enum(['auto', 'beginner', 'detailed'])
            .default('auto'),
    })
    .strict();
export const ChatPreferencesResponseSchema = z.object({
    preferences: ChatPreferencesSchema,
});
export const ConversationSourceSchema = z
    .object({
        kind: z.enum(['dictionary', 'text', 'knowledge']),
        id: z.uuid(),
        shareLocator: z
            .string()
            .min(1)
            .max(200)
            .regex(/^[A-Za-z0-9_-]+$/u)
            .optional(),
        shareKind: z.enum(['text', 'folder']).optional(),
    })
    .strict();
const CopiedCardTextSchema = z.string().max(8_000).refine(validAssistantText);
/** Immutable learner-visible fields only; absent optional fields were hidden at copying. */
export const CopiedDictionaryCardSchema = z
    .object({
        source: CopiedCardTextSchema.min(1),
        translation: CopiedCardTextSchema.min(1),
        sourceLanguage: AssistantLanguageSchema,
        targetLanguage: AssistantLanguageSchema,
        definition: CopiedCardTextSchema.nullable().optional(),
        definitionLanguage: AssistantLanguageSchema.optional(),
        transcription: CopiedCardTextSchema.nullable().optional(),
        transcriptionNotation: z
            .enum(['ipa', 'romanization', 'custom'])
            .optional(),
        transcriptionCustomLabel: z
            .string()
            .max(200)
            .refine(validAssistantText)
            .nullable()
            .optional(),
        example: CopiedCardTextSchema.nullable().optional(),
        exampleLanguage: AssistantLanguageSchema.optional(),
        exampleTranslation: CopiedCardTextSchema.nullable().optional(),
        exampleTranslationLanguage: AssistantLanguageSchema.optional(),
    })
    .strict()
    .superRefine((card, context) => {
        for (const [field, language] of [
            ['definition', 'definitionLanguage'],
            ['example', 'exampleLanguage'],
            ['exampleTranslation', 'exampleTranslationLanguage'],
        ] as const) {
            if (card[field] !== undefined && card[language] === undefined)
                context.addIssue({
                    code: 'custom',
                    path: [language],
                    message: 'A visible copied field requires its language.',
                });
        }
        if (
            card.transcription !== undefined &&
            card.transcriptionNotation === undefined
        )
            context.addIssue({
                code: 'custom',
                path: ['transcriptionNotation'],
                message: 'A visible transcription requires its notation.',
            });
    });
export type CopiedDictionaryCard = z.infer<typeof CopiedDictionaryCardSchema>;
const CopiedAttachmentBaseSchema = z.object({
    id: z.uuid(),
    label: z.string().trim().min(1).max(200).refine(validAssistantText),
    content: z.string().min(1).max(80_000).refine(validAssistantText),
});
/** Missing kind is a legacy/plain-text copy and remains an inert text attachment. */
export const CopiedAttachmentSchema = z
    .discriminatedUnion('kind', [
        CopiedAttachmentBaseSchema.extend({
            kind: z.literal('text').optional(),
        }).strict(),
        CopiedAttachmentBaseSchema.extend({
            kind: z.literal('dictionary-card'),
            card: CopiedDictionaryCardSchema,
        }).strict(),
    ])
    .superRefine((attachment, context) => {
        if (attachment.kind !== 'dictionary-card') return;
        let content: unknown;
        try {
            content = JSON.parse(attachment.content);
        } catch {
            /* Report a safe contract error below. */
        }
        const parsed = CopiedDictionaryCardSchema.safeParse(content);
        if (
            !parsed.success ||
            JSON.stringify(parsed.data) !== JSON.stringify(attachment.card)
        )
            context.addIssue({
                code: 'custom',
                path: ['content'],
                message:
                    'Copied card content must match its visible structured fields.',
            });
    });
export const ConversationStreamUnavailableSchema = z
    .object({
        status: z
            .union([
                z.literal(401),
                z.literal(403),
                z.literal(404),
                z.literal(410),
            ])
            .optional(),
    })
    .strict();
/** Bounded diagnostics are retained for support; product UI maps known codes only. */
export const ConversationErrorResponseSchema = z.object({
    error: z.object({
        code: z.string().regex(/^[a-z][a-z0-9_]{0,99}$/u),
        message: z.string().min(1).max(2_000).refine(validAssistantText),
        requestId: z
            .string()
            .min(1)
            .max(200)
            .refine(validAssistantText)
            .optional(),
        correlationId: z
            .string()
            .min(1)
            .max(200)
            .refine(validAssistantText)
            .optional(),
    }),
});
export type ConversationErrorDetail = z.infer<
    typeof ConversationErrorResponseSchema
>['error'];
export const ConversationSchema = z
    .object({
        id: z.uuid(),
        source: ConversationSourceSchema,
        preferences: ChatPreferencesSchema,
        version: z.number().int().positive(),
        createdAt: z.iso.datetime(),
        updatedAt: z.iso.datetime(),
    })
    .strict();
/** Public lifecycle only; model arguments and private tool results never cross this boundary. */
export const ConversationToolCallSchema = z
    .object({
        id: z.string().min(1).max(200).refine(validAssistantText),
        name: z.enum(['read_source_context', 'propose_knowledge_note']),
        state: z.enum(['running', 'succeeded', 'failed']),
    })
    .strict();
export type ConversationToolCall = z.infer<typeof ConversationToolCallSchema>;
export const ConversationMessageSchema = z
    .object({
        id: z.uuid(),
        conversationId: z.uuid(),
        role: z.enum(['user', 'assistant']),
        content: z.string().max(160_000),
        attachments: z.array(CopiedAttachmentSchema).max(100),
        toolCalls: z.array(ConversationToolCallSchema).max(10).default([]),
        status: z.enum(['complete', 'streaming', 'incomplete']),
        sourceVersion: z.string().max(100).nullable(),
        sourceProvenance: z.enum(['saved', 'draft']),
        createdAt: z.iso.datetime(),
        turnId: z.uuid().nullable(),
    })
    .strict();
export const ConversationUsageSchema = z
    .object({
        inputTokens: z.number().int().nonnegative(),
        outputTokens: z.number().int().nonnegative(),
        chargedCredits: z.string().regex(/^\d+$/u),
        estimated: z.boolean(),
    })
    .strict();
export const ConversationTurnSchema = z
    .object({
        modelId: z.string().min(1).max(200).nullable(),
        id: z.uuid(),
        conversationId: z.uuid(),
        status: z.enum([
            'queued',
            'running',
            'succeeded',
            'failed',
            'cancelled',
        ]),
        failureCode: z.string().max(100).nullable(),
        usage: ConversationUsageSchema,
        createdAt: z.iso.datetime(),
        updatedAt: z.iso.datetime(),
    })
    .strict();
export const ConversationDetailSchema = z
    .object({
        conversation: ConversationSchema,
        messages: z.array(ConversationMessageSchema),
        turns: z.array(ConversationTurnSchema),
        drafts: z.array(KnowledgeDraftSchema),
    })
    .strict();
export const ConversationEventSchema = z
    .object({
        id: z.number().int().nonnegative(),
        conversationId: z.uuid(),
        createdAt: z.iso.datetime(),
    })
    .and(
        z.discriminatedUnion('type', [
            z.object({
                type: z.literal('message'),
                data: ConversationMessageSchema,
            }),
            z.object({ type: z.literal('turn'), data: ConversationTurnSchema }),
            z.object({ type: z.literal('draft'), data: KnowledgeDraftSchema }),
            z.object({
                type: z.literal('snapshot'),
                data: ConversationDetailSchema,
            }),
            z.object({
                type: z.literal('draft-deleted'),
                data: z.object({ draftId: z.uuid() }),
            }),
        ]),
    );
export const CreateConversationRequestSchema = z
    .object({
        source: ConversationSourceSchema,
        preferences: ChatPreferencesSchema.optional(),
    })
    .strict();
export const UpdateConversationRequestSchema = z
    .object({ preferences: ChatPreferencesSchema })
    .strict();
export const SubmitConversationTurnRequestSchema = z
    .object({
        requestId: z.uuid(),
        content: z
            .string()
            .trim()
            .min(1)
            .max(20_000)
            .refine(validAssistantText),
        attachments: z.array(CopiedAttachmentSchema).max(10).default([]),
        draftContext: z
            .object({
                content: z.string().max(80_000).refine(validAssistantText),
            })
            .strict()
            .optional(),
        retryOf: z.uuid().optional(),
    })
    .strict();
export const UpdateKnowledgeDraftRequestSchema = z
    .object({
        expectedVersion: z.number().int().positive(),
        content: KnowledgeNoteContentSchema,
    })
    .strict();
export const PublishKnowledgeDraftRequestSchema = z
    .object({
        operationId: z.uuid(),
        expectedVersion: z.number().int().positive(),
        mode: z.enum(['new', 'update']),
        expectedNoteVersion: z.number().int().positive().optional(),
    })
    .strict();
export type KnowledgeCategory = z.infer<typeof KnowledgeCategorySchema>;
export type KnowledgeNoteContent = z.infer<typeof KnowledgeNoteContentSchema>;
export type KnowledgeNote = z.infer<typeof KnowledgeNoteSchema>;
export type KnowledgeNoteRevision = z.infer<typeof KnowledgeNoteRevisionSchema>;
export type KnowledgeDraft = z.infer<typeof KnowledgeDraftSchema>;
export type ListKnowledgeQuery = z.infer<typeof ListKnowledgeQuerySchema>;
export type CreateKnowledgeNoteRequest = z.infer<
    typeof CreateKnowledgeNoteRequestSchema
>;
export type UpdateKnowledgeNoteRequest = z.infer<
    typeof UpdateKnowledgeNoteRequestSchema
>;
export type DeleteKnowledgeNoteRequest = z.infer<
    typeof DeleteKnowledgeNoteRequestSchema
>;
export type RestoreKnowledgeNoteRequest = z.infer<
    typeof RestoreKnowledgeNoteRequestSchema
>;
export type KnowledgeErrorCode = z.infer<typeof KnowledgeErrorCodeSchema>;
export type ChatPreferences = z.infer<typeof ChatPreferencesSchema>;
export type ConversationSource = z.infer<typeof ConversationSourceSchema>;
export type CopiedAttachment = z.infer<typeof CopiedAttachmentSchema>;
export type Conversation = z.infer<typeof ConversationSchema>;
export type ConversationMessage = z.infer<typeof ConversationMessageSchema>;
export type ConversationUsage = z.infer<typeof ConversationUsageSchema>;
export type ConversationTurn = z.infer<typeof ConversationTurnSchema>;
export type ConversationDetail = z.infer<typeof ConversationDetailSchema>;
export type ConversationEvent = z.infer<typeof ConversationEventSchema>;
export type CreateConversationRequest = z.infer<
    typeof CreateConversationRequestSchema
>;
export type SubmitConversationTurnRequest = z.infer<
    typeof SubmitConversationTurnRequestSchema
>;
export type PublishKnowledgeDraftRequest = z.infer<
    typeof PublishKnowledgeDraftRequestSchema
>;
export const ListConversationsResponseSchema = z.object({
    conversations: z.array(ConversationSchema),
});
export const ConversationResponseSchema = z.object({
    conversation: ConversationSchema,
});
export const ConversationTurnResponseSchema = z.object({
    turn: ConversationTurnSchema,
});
export const ConversationContextResponseSchema = z.object({
    material: z.array(CopiedAttachmentSchema),
    total: z.number().int().nonnegative(),
});
export const KnowledgeDraftResponseSchema = z.object({
    draft: KnowledgeDraftSchema,
});
export const ConversationDeletedResponseSchema = z.object({
    deleted: z.literal(true),
});
