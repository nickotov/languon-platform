import { z } from 'zod';

export const NavigationResourceKindSchema = z.enum([
    'dictionary',
    'text',
    'knowledge',
]);
export type NavigationResourceKind = z.infer<
    typeof NavigationResourceKindSchema
>;
export const NavigationResourceSchema = z.object({
    id: z.uuid(),
    kind: NavigationResourceKindSchema,
    title: z.string(),
    href: z.string(),
    description: z.string().optional(),
    language: z.string().optional(),
    pinned: z.boolean(),
    lastOpenedAt: z.iso.datetime().nullable(),
});
export type NavigationResource = z.infer<typeof NavigationResourceSchema>;
export const NavigationQuerySchema = z.object({
    kind: NavigationResourceKindSchema.optional(),
    currentId: z.uuid().optional(),
    q: z.string().trim().min(1).max(200).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(8),
});
export type NavigationQuery = z.infer<typeof NavigationQuerySchema>;
export const NavigationRecentQuerySchema = z.object({
    limit: z.coerce.number().int().min(1).max(50).default(5),
});
export const NavigationResourceParamsSchema = z.object({
    kind: NavigationResourceKindSchema,
    id: z.uuid(),
});
export const NavigationPinRequestSchema = z
    .object({ pinned: z.boolean() })
    .strict();
export const NavigationResourcesResponseSchema = z.object({
    resources: z.array(NavigationResourceSchema),
    total: z.number().int().nonnegative().optional(),
});
export const NavigationResourceResponseSchema = z.object({
    resource: NavigationResourceSchema,
});
export const NavigationErrorResponseSchema = z.object({
    error: z.object({
        code: z.enum([
            'invalid_request',
            'authentication_required',
            'invalid_origin',
            'resource_not_found',
            'rate_limited',
            'service_unavailable',
            'internal_error',
        ]),
        message: z.string(),
        correlationId: z.uuid(),
    }),
});
