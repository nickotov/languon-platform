import { describe, expect, it } from 'vitest';
import {
    adminCreditsToMilli,
    milliToAdminCredits,
} from '../../../../../src/modules/administration/infrastructure/persistence/drizzle/admin-credit-amount';

describe('admin credit transport conversion', () => {
    it('converts whole and fractional external credits into one milli-credit ledger unit', () => {
        expect(adminCreditsToMilli(1)).toBe(1000n);
        expect(adminCreditsToMilli(0.001)).toBe(1n);
        expect(adminCreditsToMilli(12.345)).toBe(12345n);
        expect(adminCreditsToMilli(-0.125)).toBe(-125n);
    });
    it('serializes account and signed history values back to canonical external credits', () => {
        expect(milliToAdminCredits(1000n)).toBe(1);
        expect(milliToAdminCredits(1n)).toBe(0.001);
        expect(milliToAdminCredits(-125n)).toBe(-0.125);
        expect(milliToAdminCredits(0n)).toBe(0);
    });
    it('rejects ambiguous precision, exponent-sized and nonfinite adjustments', () => {
        for (const value of [0.0001, 0.1 + 0.2, 1e-7, Infinity, NaN])
            expect(() => adminCreditsToMilli(value)).toThrow();
    });
});
