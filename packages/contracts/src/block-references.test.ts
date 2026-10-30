import { expect, it } from 'vitest';
import { SubmitConversationTurnRequestSchema } from './contextual-assistant';
const id = (number: number) =>
    `01900000-0000-4000-8000-${String(number).padStart(12, '0')}`;
it('accepts eight unique reference identities while rejecting duplicates and excess', () => {
    const request = {
        requestId: id(99),
        content: 'Explain these blocks',
        blockReferences: Array.from({ length: 8 }, (_, index) => id(index + 1)),
    };
    expect(SubmitConversationTurnRequestSchema.safeParse(request).success).toBe(
        true,
    );
    expect(
        SubmitConversationTurnRequestSchema.safeParse({
            ...request,
            blockReferences: [id(1), id(1)],
        }).success,
    ).toBe(false);
    expect(
        SubmitConversationTurnRequestSchema.safeParse({
            ...request,
            blockReferences: [...request.blockReferences, id(9)],
        }).success,
    ).toBe(false);
});
