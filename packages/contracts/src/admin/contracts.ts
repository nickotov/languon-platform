import { z } from 'zod';

import {
    AdminAuditEventSchema,
    AdminDashboardResponseSchema,
    AdminMeResponseSchema,
    AdminUserDetailSchema,
    AdminUserSummarySchema,
} from './models';
import {
    AdminAuditActionSchema,
    AdminAuditOutcomeSchema,
    AdminIdSchema,
    AdminPageSchema,
    AdminPageSizeSchema,
    AdminReasonSchema,
    AdminUserStatusSchema,
} from './primitives';

export const AdminErrorCodeSchema = z.enum([
    'authentication_required',
    'admin_access_denied',
    'recent_authentication_required',
    'invalid_credentials',
    'verification_failed',
    'rate_limited',
    'capability_unavailable',
    'passkey_verification_failed',
    'user_not_found',
    'user_state_conflict',
    'ai_settings_conflict',
    'deletion_cancellation_unavailable',
    'self_disable_forbidden',
    'last_owner_forbidden',
    'invalid_request',
    'service_unavailable',
    'internal_error',
]);

export const AdminErrorResponseSchema = z
    .object({
        error: z
            .object({
                code: AdminErrorCodeSchema,
                message: z.string().min(1).max(300),
                correlationId: z.string().min(1).max(128),
            })
            .strict(),
    })
    .strict();

export const AdminUserIdParamsSchema = z
    .object({ userId: AdminIdSchema })
    .strict();

export const AdminUsersQuerySchema = z
    .object({
        page: AdminPageSchema.default(1),
        pageSize: AdminPageSizeSchema.default(25),
        search: z.string().trim().max(320).optional(),
        status: AdminUserStatusSchema.optional(),
    })
    .strict();

export const AdminUsersResponseSchema = z
    .object({
        data: z.array(AdminUserSummarySchema),
        page: z.number().int().positive(),
        pageSize: z.number().int().positive().max(100),
        total: z.number().int().nonnegative(),
    })
    .strict();

export const AdminUserResponseSchema = z
    .object({ user: AdminUserDetailSchema })
    .strict();

export const AdminUserStatusMutationRequestSchema = z
    .object({
        expectedVersion: z.number().int().positive(),
        reason: AdminReasonSchema,
    })
    .strict();

export const AdminUserStatusMutationResponseSchema = z
    .object({ user: AdminUserDetailSchema })
    .strict();

export const AdminAuditEventsQuerySchema = z
    .object({
        page: AdminPageSchema.default(1),
        pageSize: AdminPageSizeSchema.default(25),
        action: AdminAuditActionSchema.optional(),
        outcome: AdminAuditOutcomeSchema.optional(),
        actorUserId: AdminIdSchema.optional(),
        targetUserId: AdminIdSchema.optional(),
    })
    .strict();

export const AdminAuditEventsResponseSchema = z
    .object({
        data: z.array(AdminAuditEventSchema),
        page: z.number().int().positive(),
        pageSize: z.number().int().positive().max(100),
        total: z.number().int().nonnegative(),
    })
    .strict();

export const AdminAiHealthSchema = z
    .object({
        status: z.enum(['available', 'unavailable', 'unverified']),
        checkedAt: z.string().datetime().nullable(),
        message: z.string().trim().min(1).max(300).nullable(),
    })
    .strict();

export const AdminAiModelSchema = z
    .object({
        id: z.string().trim().min(1).max(160),
        label: z.string().trim().min(1).max(160),
        supportedFormats: z.array(z.string().trim().min(1).max(160)).min(1),
        available: z.boolean(),
        unavailableReason: z.string().trim().min(1).max(300).nullable(),
    })
    .strict();

export const AdminAiProviderSchema = z
    .object({
        id: z.enum(['deepseek', 'kie']),
        label: z.string().trim().min(1).max(80),
        credentialStatus: z.enum(['configured', 'missing']),
        health: AdminAiHealthSchema,
        models: z.array(AdminAiModelSchema).min(1),
    })
    .strict();

export const AdminAiSettingsSchema = z
    .object({
        version: z.number().int().nonnegative(),
        activeProvider: z.enum(['deepseek', 'kie']).nullable(),
        defaultModel: z.string().trim().min(1).max(160).nullable(),
        enabledModels: z.array(z.string().trim().min(1).max(160)),
        updatedAt: z.string().datetime().nullable(),
    })
    .strict();

export const AdminAiSettingsResponseSchema = z
    .object({
        settings: AdminAiSettingsSchema,
        providers: z.array(AdminAiProviderSchema),
    })
    .strict();

export const AdminAiSettingsMutationRequestSchema = z
    .object({
        expectedVersion: z.number().int().nonnegative(),
        activeProvider: z.enum(['deepseek', 'kie']),
        defaultModel: z.string().trim().min(1).max(160),
        enabledModels: z
            .array(z.string().trim().min(1).max(160))
            .min(1)
            .max(32),
        reason: AdminReasonSchema,
    })
    .strict()
    .superRefine((value, context) => {
        if (new Set(value.enabledModels).size !== value.enabledModels.length) {
            context.addIssue({
                code: 'custom',
                message: 'Enabled models must be unique.',
                path: ['enabledModels'],
            });
        }
        if (!value.enabledModels.includes(value.defaultModel)) {
            context.addIssue({
                code: 'custom',
                message: 'The default model must be enabled.',
                path: ['defaultModel'],
            });
        }
    });

export const AdminAiSettingsMutationResponseSchema =
    AdminAiSettingsResponseSchema;

export const AdminEndpointSchemas = {
    me: { response: AdminMeResponseSchema, error: AdminErrorResponseSchema },
    dashboard: {
        response: AdminDashboardResponseSchema,
        error: AdminErrorResponseSchema,
    },
    users: {
        query: AdminUsersQuerySchema,
        response: AdminUsersResponseSchema,
        error: AdminErrorResponseSchema,
    },
    user: {
        params: AdminUserIdParamsSchema,
        response: AdminUserResponseSchema,
        error: AdminErrorResponseSchema,
    },
    disableUser: {
        params: AdminUserIdParamsSchema,
        body: AdminUserStatusMutationRequestSchema,
        response: AdminUserStatusMutationResponseSchema,
        error: AdminErrorResponseSchema,
    },
    restoreUser: {
        params: AdminUserIdParamsSchema,
        body: AdminUserStatusMutationRequestSchema,
        response: AdminUserStatusMutationResponseSchema,
        error: AdminErrorResponseSchema,
    },
    cancelUserDeletion: {
        params: AdminUserIdParamsSchema,
        body: AdminUserStatusMutationRequestSchema,
        response: AdminUserStatusMutationResponseSchema,
        error: AdminErrorResponseSchema,
    },
    auditEvents: {
        query: AdminAuditEventsQuerySchema,
        response: AdminAuditEventsResponseSchema,
        error: AdminErrorResponseSchema,
    },
    aiSettings: {
        response: AdminAiSettingsResponseSchema,
        error: AdminErrorResponseSchema,
    },
    updateAiSettings: {
        body: AdminAiSettingsMutationRequestSchema,
        response: AdminAiSettingsMutationResponseSchema,
        error: AdminErrorResponseSchema,
    },
} as const;

export type AdminErrorCode = z.infer<typeof AdminErrorCodeSchema>;
export type AdminErrorResponse = z.infer<typeof AdminErrorResponseSchema>;
export type AdminUsersQuery = z.infer<typeof AdminUsersQuerySchema>;
export type AdminUsersResponse = z.infer<typeof AdminUsersResponseSchema>;
export type AdminUserResponse = z.infer<typeof AdminUserResponseSchema>;
export type AdminUserStatusMutationRequest = z.infer<
    typeof AdminUserStatusMutationRequestSchema
>;
export type AdminUserStatusMutationResponse = z.infer<
    typeof AdminUserStatusMutationResponseSchema
>;
export type AdminAuditEventsQuery = z.infer<typeof AdminAuditEventsQuerySchema>;
export type AdminAuditEventsResponse = z.infer<
    typeof AdminAuditEventsResponseSchema
>;
export type AdminAiSettingsResponse = z.infer<
    typeof AdminAiSettingsResponseSchema
>;
export type AdminAiSettingsMutationRequest = z.infer<
    typeof AdminAiSettingsMutationRequestSchema
>;
export type AdminAiSettingsMutationResponse = z.infer<
    typeof AdminAiSettingsMutationResponseSchema
>;
