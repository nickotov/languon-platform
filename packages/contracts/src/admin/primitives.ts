import { z } from 'zod';

import {
    AuthIdSchema,
    AuthTimestampSchema,
    EmailSchema,
} from '../auth/primitives';

export const AdminIdSchema = AuthIdSchema;
export const AdminTimestampSchema = AuthTimestampSchema;
export const AdminEmailSchema = EmailSchema;
export const AdminRoleSchema = z.literal('owner');
export const AdminUserStatusSchema = z.enum([
    'pending',
    'active',
    'disabled',
    'deletion_pending',
    'purged',
]);
export const AdminAuditOutcomeSchema = z.enum(['success', 'rejected']);
export const AdminAuditActionSchema = z.enum([
    'membership_granted',
    'membership_revoked',
    'user_disabled',
    'user_restored',
    'user_deletion_cancelled',
    'access_denied',
    'audit_pruned',
]);

export const AdminReasonSchema = z
    .string()
    .trim()
    .min(5, 'Reason must contain at least 5 characters')
    .max(500, 'Reason must contain at most 500 characters');

export const AdminPageSchema = z.coerce.number().int().min(1).max(10_000);
export const AdminPageSizeSchema = z.coerce.number().int().min(1).max(100);

export type AdminRole = z.infer<typeof AdminRoleSchema>;
export type AdminUserStatus = z.infer<typeof AdminUserStatusSchema>;
export type AdminAuditOutcome = z.infer<typeof AdminAuditOutcomeSchema>;
export type AdminAuditAction = z.infer<typeof AdminAuditActionSchema>;
export type AdminReason = z.infer<typeof AdminReasonSchema>;
