import { z } from 'zod';
import { KnowledgeNoteSchema } from './contextual-assistant';

const title = z
    .string()
    .trim()
    .min(1)
    .max(200)
    .refine(
        (value) => !/[\uD800-\uDFFF]/u.test(value) && !value.includes('\u0000'),
    );
export const WorkbookIdParamsSchema = z
    .object({ workbookId: z.uuid() })
    .strict();
export const WorkbookShareLocatorSchema = z
    .string()
    .regex(/^[A-Za-z0-9_-]{32}$/u);
export const WorkbookShareKeySchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/u);
export const WorkbookVersionSchema = z
    .object({ expectedVersion: z.number().int().positive() })
    .strict();
/** Client-generated identity makes retrying creation safe; deleted identities cannot be recreated. */
export const CreateWorkbookRequestSchema = z
    .object({ id: z.uuid(), title })
    .strict();
export const UpdateWorkbookRequestSchema = WorkbookVersionSchema.extend({
    title,
});
export const SetWorkbookNotesRequestSchema = WorkbookVersionSchema.extend({
    noteIds: z
        .array(z.uuid())
        .max(500)
        .refine(
            (ids) => new Set(ids).size === ids.length,
            'Notes must not be repeated.',
        ),
    acknowledgeSharedAddition: z.boolean().default(false),
});
export const WorkbookNoteSummarySchema = z
    .object({
        id: z.uuid(),
        title: z.string(),
        status: z.enum(['draft', 'saved']),
    })
    .strict();
export const WorkbookSchema = z
    .object({
        id: z.uuid(),
        title,
        version: z.number().int().positive(),
        shared: z.boolean(),
        notes: z.array(WorkbookNoteSummarySchema).max(500),
        createdAt: z.iso.datetime(),
        updatedAt: z.iso.datetime(),
    })
    .strict();
export const SharedWorkbookSchema = WorkbookSchema.omit({
    shared: true,
    notes: true,
}).extend({ notes: z.array(KnowledgeNoteSchema).max(500) });
export const WorkbookShareSchema = z
    .object({
        locator: WorkbookShareLocatorSchema,
        key: WorkbookShareKeySchema,
    })
    .strict();
export type Workbook = z.infer<typeof WorkbookSchema>;
export type SharedWorkbook = z.infer<typeof SharedWorkbookSchema>;
export type CreateWorkbookRequest = z.infer<typeof CreateWorkbookRequestSchema>;
export type UpdateWorkbookRequest = z.infer<typeof UpdateWorkbookRequestSchema>;
export type SetWorkbookNotesRequest = z.infer<
    typeof SetWorkbookNotesRequestSchema
>;
export type WorkbookShare = z.infer<typeof WorkbookShareSchema>;

export const CopyWorkbookRequestSchema = z
    .object({ id: z.uuid(), title })
    .strict();
export type CopyWorkbookRequest = z.infer<typeof CopyWorkbookRequestSchema>;
