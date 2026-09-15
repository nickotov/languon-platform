import { z } from 'zod';

import {
    AdminAuditActionSchema,
    AdminAuditOutcomeSchema,
    AdminEmailSchema,
    AdminIdSchema,
    AdminRoleSchema,
    AdminTimestampSchema,
    AdminUserStatusSchema,
} from './primitives';

export const AdminActorSchema = z
    .object({
        id: AdminIdSchema,
        primaryEmail: AdminEmailSchema,
        role: AdminRoleSchema,
    })
    .strict();

export const AdminUserSummarySchema = z
    .object({
        id: AdminIdSchema,
        primaryEmail: AdminEmailSchema,
        emailVerified: z.boolean(),
        status: AdminUserStatusSchema,
        version: z.number().int().positive(),
        createdAt: AdminTimestampSchema,
        updatedAt: AdminTimestampSchema,
        isOwner: z.boolean(),
    })
    .strict();

export const AdminUserDetailSchema = AdminUserSummarySchema.extend({
    activeSessionCount: z.number().int().nonnegative(),
    passkeyCount: z.number().int().nonnegative(),
}).strict();

export const AdminAuditEventSchema = z
    .object({
        id: AdminIdSchema,
        actorUserId: AdminIdSchema,
        actorEmail: AdminEmailSchema.nullable(),
        targetUserId: AdminIdSchema.nullable(),
        targetEmail: AdminEmailSchema.nullable(),
        action: AdminAuditActionSchema,
        outcome: AdminAuditOutcomeSchema,
        reason: z.string().min(5).max(500).nullable(),
        beforeStatus: AdminUserStatusSchema.nullable(),
        afterStatus: AdminUserStatusSchema.nullable(),
        beforeVersion: z.number().int().positive().nullable(),
        afterVersion: z.number().int().positive().nullable(),
        correlationId: AdminIdSchema,
        occurredAt: AdminTimestampSchema,
        expiresAt: AdminTimestampSchema,
    })
    .strict();

export const AdminDashboardResponseSchema = z
    .object({
        counts: z
            .object({
                users: z.number().int().nonnegative(),
                activeUsers: z.number().int().nonnegative(),
                pendingUsers: z.number().int().nonnegative(),
                disabledUsers: z.number().int().nonnegative(),
                owners: z.number().int().nonnegative(),
            })
            .strict(),
        recentAuditEvents: z.array(AdminAuditEventSchema).max(20),
    })
    .strict();

export const AdminMeResponseSchema = z
    .object({ actor: AdminActorSchema })
    .strict();

export type AdminActor = z.infer<typeof AdminActorSchema>;
export type AdminUserSummary = z.infer<typeof AdminUserSummarySchema>;
export type AdminUserDetail = z.infer<typeof AdminUserDetailSchema>;
export type AdminAuditEvent = z.infer<typeof AdminAuditEventSchema>;
export type AdminDashboardResponse = z.infer<
    typeof AdminDashboardResponseSchema
>;
export type AdminMeResponse = z.infer<typeof AdminMeResponseSchema>;
