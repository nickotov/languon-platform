import { describe, expect, it } from 'vitest';
import {
    assertCreditBounds,
    assertSpendingBounds,
} from '../../../../src/modules/admin-mcp/infrastructure/operations/admin-mcp-operations';
import {
    adminMcpReadSchemas,
    adminMcpWriteSchemas,
    reportRange,
} from '../../../../src/modules/admin-mcp/application/operation-schemas';
import type { AdminMcpActor } from '../../../../src/modules/admin-mcp/domain/admin-mcp';

const actor: AdminMcpActor = {
    tokenId: '00000000-0000-4000-8000-000000000001',
    userId: '00000000-0000-4000-8000-000000000002',
    permissions: [],
    allowedActions: [],
    limits: {
        creditGrants: { perOperation: '2.145', perDay: '10' },
        creditRevocations: { perOperation: '1', perDay: '3' },
        spendingLimits: {
            maximumCreditsPerAction: '10',
            maximumProviderUsdPerAction: '0.1',
            maximumProviderUsdPerAccountDay: '1',
            maximumProviderUsdGloballyDay: '5',
        },
    },
};
const settings = {
    defaultMaxCreditsPerAction: '10',
    maxProviderCostUsdPerAction: '0.1',
    maxProviderCostUsdPerAccountDay: '1',
    maxProviderCostUsdPerDay: '5',
};

describe('delegated administrative bounds', () => {
    it('compares fractional grants exactly and keeps revocations independently bounded', () => {
        expect(() =>
            assertCreditBounds(actor, 'credits.grant', '2.145'),
        ).not.toThrow();
        expect(() =>
            assertCreditBounds(actor, 'credits.grant', '2.146'),
        ).toThrow('delegated limit');
        expect(() =>
            assertCreditBounds(actor, 'credits.revoke', '1.001'),
        ).toThrow('delegated limit');
        expect(() =>
            assertCreditBounds(
                { ...actor, limits: {} },
                'credits.grant',
                '0.001',
            ),
        ).toThrow();
    });
    it('rejects disabled or oversized operator limits rather than letting settings bypass the token', () => {
        expect(() => assertSpendingBounds(actor, settings)).not.toThrow();
        for (const key of Object.keys(settings) as (keyof typeof settings)[]) {
            expect(() =>
                assertSpendingBounds(actor, { ...settings, [key]: null }),
            ).toThrow();
            expect(() =>
                assertSpendingBounds(actor, { ...settings, [key]: '11' }),
            ).toThrow();
        }
    });
    it('accepts only positive thousandth-credit adjustments and cannot attach an expiry to revocations', () => {
        const input = {
            targetUserId: actor.userId,
            expectedVersion: 1,
            amountCredits: '0.001',
            expiresAt: null,
            reason: 'Synthetic credit adjustment',
        };
        expect(
            adminMcpWriteSchemas['credits.grant'].safeParse(input).success,
        ).toBe(true);
        for (const amountCredits of ['-1', '0', '0.0001', '1e2'])
            expect(
                adminMcpWriteSchemas['credits.grant'].safeParse({
                    ...input,
                    amountCredits,
                }).success,
            ).toBe(false);
        expect(
            adminMcpWriteSchemas['credits.revoke'].safeParse({
                ...input,
                expiresAt: '2026-11-01T00:00:00.000Z',
            }).success,
        ).toBe(false);
    });
    it('bounds report ranges and pagination and uses stable UTC default periods', () => {
        const result = reportRange({}, new Date('2026-10-27T17:00:00Z'));
        expect(result.to.toISOString()).toBe('2026-10-28T00:00:00.000Z');
        expect(result.from.toISOString()).toBe('2026-09-28T00:00:00.000Z');
        expect(reportRange({}, new Date('2026-10-27T00:01:00Z'))).toEqual(
            reportRange({}, new Date('2026-10-27T23:59:59Z')),
        );
        expect(() =>
            reportRange({
                from: '2025-01-01T00:00:00.000Z',
                to: '2026-10-01T00:00:00.000Z',
            }),
        ).toThrow();
        expect(
            adminMcpReadSchemas['financial-reports.user'].safeParse({
                userId: actor.userId,
                pageSize: 101,
            }).success,
        ).toBe(false);
        expect(
            adminMcpReadSchemas['users.lookup'].safeParse({
                email: 'a@b.test',
                sql: 'select 1',
            }).success,
        ).toBe(false);
    });
});
