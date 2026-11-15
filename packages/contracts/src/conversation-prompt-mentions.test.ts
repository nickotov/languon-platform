import { describe, expect, it } from 'vitest';
import { SubmitConversationTurnRequestSchema } from './contextual-assistant';

const request = {
    requestId: '00000000-0000-4000-8000-000000000001',
    content: 'Generate meaning for words',
    promptMentions: [
        {
            kind: 'exercise',
            activityId: 'V02',
            catalogVersion: 1,
            start: 9,
            end: 16,
        },
    ],
};

describe('typed prompt mentions', () => {
    it('accepts bounded exact identities and text ranges', () => {
        expect(
            SubmitConversationTurnRequestSchema.parse(request).promptMentions,
        ).toEqual(request.promptMentions);
    });

    it('rejects unknown identity, version, overlapping or out of range labels', () => {
        for (const promptMentions of [
            [{ ...request.promptMentions[0], activityId: 'V99' }],
            [{ ...request.promptMentions[0], catalogVersion: 2 }],
            [{ ...request.promptMentions[0], end: 99 }],
            [{ ...request.promptMentions[0], end: 9 }],
            [request.promptMentions[0], request.promptMentions[0]],
        ]) {
            expect(
                SubmitConversationTurnRequestSchema.safeParse({
                    ...request,
                    promptMentions,
                }).success,
            ).toBe(false);
        }
    });

    it('rejects a range splitting an astral character', () => {
        expect(
            SubmitConversationTurnRequestSchema.safeParse({
                ...request,
                content: 'a😀b',
                promptMentions: [
                    { ...request.promptMentions[0], start: 1, end: 2 },
                ],
            }).success,
        ).toBe(false);
    });
});
