import { z } from 'zod';
import { parseCreditMilli } from './ai-credit-amount';

const AvailableCreditsSchema = z.string().refine((value) => {
    try {
        parseCreditMilli(value);
        return true;
    } catch {
        return false;
    }
}, 'Expected a nonnegative exact credit amount.');

export const LearnerAiCreditBalanceSchema = z.discriminatedUnion('mode', [
    z
        .object({
            mode: z.literal('limited'),
            availableCredits: AvailableCreditsSchema,
        })
        .strict(),
    z
        .object({ mode: z.literal('unlimited'), availableCredits: z.null() })
        .strict(),
]);

export type LearnerAiCreditBalance = z.infer<
    typeof LearnerAiCreditBalanceSchema
>;
