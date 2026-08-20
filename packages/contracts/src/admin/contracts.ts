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
    auditEvents: {
        query: AdminAuditEventsQuerySchema,
        response: AdminAuditEventsResponseSchema,
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
