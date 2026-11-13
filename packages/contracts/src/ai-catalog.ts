import { z } from 'zod';

export const AdminAiCatalogKindSchema = z.enum(['agent', 'tool', 'prompt']);
export const AdminAiCatalogIdSchema = z
    .string()
    .min(1)
    .max(160)
    .regex(/^[A-Za-z0-9][A-Za-z0-9_.:-]*$/u);
export const AdminAiCatalogReferenceSchema = z
    .object({ kind: AdminAiCatalogKindSchema, id: AdminAiCatalogIdSchema })
    .strict();
export const AdminAiCatalogSummarySchema = z
    .object({
        id: AdminAiCatalogIdSchema,
        kind: AdminAiCatalogKindSchema,
        name: z.string().min(1).max(200),
        description: z.string().max(8_000),
        module: z.string().min(1).max(100),
        scope: z.enum(['application', 'development', 'template']),
        references: z.array(AdminAiCatalogReferenceSchema).max(100),
    })
    .strict();
const jsonSchema = z.record(z.string(), z.json()).nullable();
const common = AdminAiCatalogSummarySchema.shape;
export const AdminAiCatalogEntrySchema = z.discriminatedUnion('kind', [
    z
        .object({
            ...common,
            kind: z.literal('agent'),
            staticInstructions: z
                .array(
                    z
                        .object({
                            label: z.string().min(1),
                            text: z.string().max(200_000),
                        })
                        .strict(),
                )
                .max(100),
            limitations: z.array(z.string().max(8_000)).max(30),
        })
        .strict(),
    z
        .object({
            ...common,
            kind: z.literal('tool'),
            inputSchema: jsonSchema,
            outputSchema: jsonSchema,
            requestContextSchema: jsonSchema,
            limitations: z.array(z.string().max(8_000)).max(30),
        })
        .strict(),
    z
        .object({
            ...common,
            kind: z.literal('prompt'),
            content: z.string().max(200_000),
            sourcePath: z.string().min(1).max(500),
            limitations: z.array(z.string().max(8_000)).max(30),
        })
        .strict(),
]);
export const AdminAiCatalogListResponseSchema = z
    .object({ entries: z.array(AdminAiCatalogSummarySchema).max(1_000) })
    .strict();
export const AdminAiCatalogDetailResponseSchema = z
    .object({ entry: AdminAiCatalogEntrySchema })
    .strict();
export const AdminAiCatalogParamsSchema = z
    .object({ kind: AdminAiCatalogKindSchema, id: AdminAiCatalogIdSchema })
    .strict();
export type AdminAiCatalogKind = z.infer<typeof AdminAiCatalogKindSchema>;
export type AdminAiCatalogReference = z.infer<
    typeof AdminAiCatalogReferenceSchema
>;
export type AdminAiCatalogSummary = z.infer<typeof AdminAiCatalogSummarySchema>;
export type AdminAiCatalogEntry = z.infer<typeof AdminAiCatalogEntrySchema>;
export type AdminAiCatalogListResponse = z.infer<
    typeof AdminAiCatalogListResponseSchema
>;
export type AdminAiCatalogDetailResponse = z.infer<
    typeof AdminAiCatalogDetailResponseSchema
>;
