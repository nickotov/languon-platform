import { z } from 'zod';
import { parseCreditMilli } from './ai-credit-amount';
const CreditAmountSchema = z.string().refine((value) => {
    try {
        parseCreditMilli(value);
        return true;
    } catch {
        return false;
    }
}, 'Expected exact nonnegative decimal credits.');
/** Server-owned offer; confirming repeats the original request and idempotency key. */
export const ActionAllowanceQuoteSchema = z
    .object({
        id: z.uuid(),
        maximumCredits: CreditAmountSchema,
        approximateOutputTokens: z.number().int().min(1).max(10000),
        expiresAt: z.iso.datetime(),
    })
    .strict();
export type ActionAllowanceQuote = z.infer<typeof ActionAllowanceQuoteSchema>;
/** Learner projection only; provider currency and internal accounting units stay private. */
export const ActionBillingSchema = z
    .object({
        state: z.enum(['held', 'charged', 'released', 'free']),
        heldCredits: CreditAmountSchema,
        chargedCredits: CreditAmountSchema.nullable(),
        measurement: z.enum(['measured', 'estimated', 'unknown']).nullable(),
    })
    .strict();
export type ActionBilling = z.infer<typeof ActionBillingSchema>;
