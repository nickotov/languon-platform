import { describe, expect, it } from 'vitest';
import {
    compactCredits,
    validActionBudget,
} from '@/fsd/features/text-ai-preferences/lib/action-budget';

describe('action budget decimal presentation', () => {
    it('accepts positive exact thousandths and rejects imprecise or ambiguous input', () => {
        for (const value of ['0.001', '1', '1.000', '9999999999.999'])
            expect(validActionBudget(value)).toBe(true);
        for (const value of [
            '',
            '0',
            '0.000',
            '-1',
            '1.0001',
            '1e3',
            '1,5',
            ' 1',
            '01',
            '999999999999999999.999',
        ])
            expect(validActionBudget(value)).toBe(false);
    });
    it('keeps tiny nonzero credits visible and rounds without losing large integer precision', () => {
        expect(compactCredits('0.001')).toBe('<0.01');
        expect(compactCredits('0.009')).toBe('<0.01');
        expect(compactCredits('0.010')).toBe('0.01');
        expect(compactCredits('1.235')).toBe('1.24');
        expect(compactCredits('999999999999999999.999')).toBe(
            '1000000000000000000.00',
        );
    });
});
