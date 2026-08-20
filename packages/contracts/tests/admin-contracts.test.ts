import { describe, expect, it } from 'vitest';

import {
    AdminAuditEventsQuerySchema,
    AdminReasonSchema,
    AdminUsersQuerySchema,
    AdminUserStatusMutationRequestSchema,
} from '../src/admin';

describe('admin contracts', () => {
    it('normalizes bounded mutation reasons', () => {
        expect(AdminReasonSchema.parse('  account owner request  ')).toBe(
            'account owner request',
        );
        expect(() => AdminReasonSchema.parse('no')).toThrow();
        expect(() => AdminReasonSchema.parse('x'.repeat(501))).toThrow();
    });

    it('rejects unversioned or ambiguous status mutations', () => {
        expect(
            AdminUserStatusMutationRequestSchema.parse({
                expectedVersion: 3,
                reason: 'verified support request',
            }),
        ).toEqual({
            expectedVersion: 3,
            reason: 'verified support request',
        });
        expect(() =>
            AdminUserStatusMutationRequestSchema.parse({
                expectedVersion: 0,
                reason: 'verified support request',
            }),
        ).toThrow();
    });

    it('coerces safe pagination and rejects unknown query keys', () => {
        expect(
            AdminUsersQuerySchema.parse({ page: '2', pageSize: '50' }),
        ).toEqual({
            page: 2,
            pageSize: 50,
        });
        expect(
            AdminAuditEventsQuerySchema.parse({
                page: undefined,
                pageSize: undefined,
            }),
        ).toEqual({ page: 1, pageSize: 25 });
        expect(() => AdminUsersQuerySchema.parse({ pageSize: 101 })).toThrow();
        expect(() => AdminUsersQuerySchema.parse({ role: 'owner' })).toThrow();
    });
});
