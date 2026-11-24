import { z } from 'zod';

export const ConversationActionQuoteSchema = z
    .object({
        scope: z.enum(['lesson-if-planned', 'listening-lesson']).optional(),
        id: z.uuid(),
        maximumCredits: z.string().regex(/^(0|[1-9][0-9]*)(\.[0-9]{1,3})?$/u),
        approximateOutputTokens: z.number().int().min(1).max(10000),
        expiresAt: z.iso.datetime(),
    })
    .strict();
export type ConversationActionQuote = z.infer<
    typeof ConversationActionQuoteSchema
>;
