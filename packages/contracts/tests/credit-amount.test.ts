import { describe, expect, it } from 'vitest';
import { parseCreditMilli } from '../src/ai-credit-amount';

describe('exact public credit parser', () => {
    it('preserves milli-credit precision and large integer values', () => {
        expect(parseCreditMilli('0.001')).toBe(1n);
        expect(parseCreditMilli('0.125')).toBe(125n);
        expect(parseCreditMilli('9007199254740.991')).toBe(9007199254740991n);
        expect(parseCreditMilli('0')).toBe(0n);
    });
    it.each([
        '-1',
        '01',
        '1e3',
        '0.0001',
        '1.',
        'NaN',
        '10000000000000',
        '9007199254740.992',
        ' 1',
    ])('rejects invalid decimal %s', (value) => {
        expect(() => parseCreditMilli(value)).toThrow(RangeError);
    });
});
