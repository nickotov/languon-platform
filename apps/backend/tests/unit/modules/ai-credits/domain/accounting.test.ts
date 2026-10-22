import { describe, expect, it } from 'vitest';
import {
    AccountingRecordRequestSchema,
    AccountingPaymentRequestSchema,
} from '@languon/contracts';
import {
    formatFixed,
    parseFixed,
    purchaseValueMicros,
    refundedConsumedValueMicros,
} from '../../../../../src/modules/ai-credits/domain/accounting';

describe('exact USD and purchase attribution', () => {
    it('retains fractional sub-cent USD and fractional credits without floating point', () => {
        expect(parseFixed('12345678901.000001', 6)).toBe(12345678901000001n);
        expect(formatFixed(-10001n, 6)).toBe('-0.010001');
        expect(parseFixed('0.001', 3)).toBe(1n);
        expect(() => parseFixed('1e3', 6)).toThrow();
        expect(() => parseFixed('1.0000001', 6)).toThrow();
    });
    it('attributes actual purchase value and never overstates fractional micros', () => {
        expect(purchaseValueMicros(1000000n, 1n, 3n)).toBe(333333n);
        expect(purchaseValueMicros(0n, 1n, 3n)).toBe(0n);
        expect(() => purchaseValueMicros(1n, 4n, 3n)).toThrow();
    });
    it('exposes refunds of consumed value without counting a refund of unused credits as loss', () => {
        expect(
            refundedConsumedValueMicros({
                paid: 100n,
                refunded: 50n,
                consumed: 5n,
                issued: 10n,
            }),
        ).toBe(0n);
        expect(
            refundedConsumedValueMicros({
                paid: 100n,
                refunded: 100n,
                consumed: 5n,
                issued: 10n,
            }),
        ).toBe(50n);
    });
    it('does not issue a purchase lot larger than the fully revocable payment limit', () => {
        const request = {
            kind: 'payment',
            ownerId: '11111111-1111-4111-8111-111111111111',
            source: 'manual',
            idempotencyKey: '11111111-1111-4111-8111-111111111111',
            occurredAt: '2026-10-01T00:00:00Z',
            reference: 'receipt',
            reason: 'Manual payment evidence',
            amountUsd: '1',
            feeUsd: '0',
            credits: '1000000000000',
        };
        expect(AccountingPaymentRequestSchema.safeParse(request).success).toBe(
            true,
        );
        expect(
            AccountingPaymentRequestSchema.safeParse({
                ...request,
                credits: '1000000000000.001',
            }).success,
        ).toBe(false);
    });
    it('requires manual evidence and ordered bill periods', () => {
        const bill = {
            kind: 'provider_bill',
            providerId: 'test-provider',
            source: 'manual',
            idempotencyKey: '11111111-1111-4111-8111-111111111111',
            occurredAt: '2026-10-01T00:00:00Z',
            reference: 'invoice-1',
            reason: 'Manual invoice evidence',
            amountUsd: '1.000001',
            periodStart: '2026-09-01T00:00:00Z',
            periodEnd: '2026-10-01T00:00:00Z',
        };
        expect(AccountingRecordRequestSchema.safeParse(bill).success).toBe(
            true,
        );
        expect(
            AccountingRecordRequestSchema.safeParse({
                ...bill,
                periodEnd: bill.periodStart,
            }).success,
        ).toBe(false);
        expect(
            AccountingRecordRequestSchema.safeParse({
                ...bill,
                source: 'automatic',
            }).success,
        ).toBe(false);
    });
});
