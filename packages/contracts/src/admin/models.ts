import { z } from 'zod';

import {
    AdminAuditActionSchema,
    AdminAuditOutcomeSchema,
    AdminAiCreditAmountSchema,
    AdminAiCreditSignedAmountSchema,
    AdminAiCreditModeSchema,
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
        targetKind: z
            .enum(['user', 'dictionary_ai_configuration', 'ai_credit_account'])
            .nullable()
            .optional(),
        targetId: z.string().trim().min(1).max(160).nullable().optional(),
        action: AdminAuditActionSchema,
        outcome: AdminAuditOutcomeSchema,
        reason: z.string().min(5).max(500).nullable(),
        beforeStatus: AdminUserStatusSchema.nullable(),
        afterStatus: AdminUserStatusSchema.nullable(),
        beforeVersion: z.number().int().nonnegative().nullable(),
        afterVersion: z.number().int().nonnegative().nullable(),
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

export const AdminAiCreditHistoryEntrySchema = z
    .object({
        id: AdminIdSchema,
        kind: z.enum([
            'grant',
            'removal',
            'reservation',
            'settlement',
            'release',
            'policy_update',
        ]),
        amountCredits: AdminAiCreditSignedAmountSchema,
        sourceKind: z
            .enum(['admin', 'subscription', 'purchase', 'migration'])
            .nullable(),
        measurementSource: z
            .enum(['provider_reported', 'estimated', 'unmetered'])
            .nullable(),
        reason: z.string().trim().min(5).max(500).nullable(),
        occurredAt: AdminTimestampSchema,
        expiresAt: AdminTimestampSchema.nullable(),
    })
    .strict();

export const AdminAiCreditAccountSchema = z
    .object({
        userId: AdminIdSchema,
        configuredMode: AdminAiCreditModeSchema,
        effectiveMode: AdminAiCreditModeSchema,
        unlimitedUntil: AdminTimestampSchema.nullable(),
        managementVersion: z.number().int().nonnegative(),
        availableCredits: AdminAiCreditAmountSchema,
        reservedCredits: AdminAiCreditAmountSchema,
        lifetimeConsumedCredits: AdminAiCreditAmountSchema,
        nextExpirationAt: AdminTimestampSchema.nullable(),
        enforcementEnabled: z.boolean(),
    })
    .strict();

export type AdminActor = z.infer<typeof AdminActorSchema>;
export type AdminUserSummary = z.infer<typeof AdminUserSummarySchema>;
export type AdminUserDetail = z.infer<typeof AdminUserDetailSchema>;
export type AdminAuditEvent = z.infer<typeof AdminAuditEventSchema>;
export type AdminDashboardResponse = z.infer<
    typeof AdminDashboardResponseSchema
>;
export type AdminMeResponse = z.infer<typeof AdminMeResponseSchema>;
export type AdminAiCreditHistoryEntry = z.infer<
    typeof AdminAiCreditHistoryEntrySchema
>;
export type AdminAiCreditAccount = z.infer<typeof AdminAiCreditAccountSchema>;
