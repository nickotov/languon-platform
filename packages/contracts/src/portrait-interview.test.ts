import { describe, expect, it } from 'vitest';
import {
    PortraitInterviewSubmissionSchema,
    SubmitPortraitInterviewSchema,
} from './portrait-interview';
describe('portrait interview submission contracts', () => {
    it('counts grapheme clusters instead of UTF-16 units for custom answers', () => {
        const family = '👨‍👩‍👦';
        expect(
            PortraitInterviewSubmissionSchema.safeParse({
                kind: 'answer',
                topic: 'goals',
                text: family.repeat(200),
            }).success,
        ).toBe(true);
        expect(
            PortraitInterviewSubmissionSchema.safeParse({
                kind: 'answer',
                topic: 'goals',
                text: family.repeat(201),
            }).success,
        ).toBe(false);
    });
    it('allows clarification messages to 1000 characters independently of 200-character answer fields', () => {
        expect(
            PortraitInterviewSubmissionSchema.safeParse({
                kind: 'chat',
                topic: 'goals',
                text: 'x'.repeat(1000),
            }).success,
        ).toBe(true);
        expect(
            PortraitInterviewSubmissionSchema.safeParse({
                kind: 'chat',
                topic: 'goals',
                text: 'x'.repeat(1001),
            }).success,
        ).toBe(false);
    });
    it('requires an explicit meaningful answer while skip remains a separate action', () => {
        expect(
            PortraitInterviewSubmissionSchema.safeParse({
                kind: 'answer',
                topic: 'goals',
                text: '   ',
            }).success,
        ).toBe(false);
        expect(
            PortraitInterviewSubmissionSchema.safeParse({
                kind: 'answer',
                topic: 'goals',
                selected: [],
            }).success,
        ).toBe(false);
        expect(
            PortraitInterviewSubmissionSchema.safeParse({
                kind: 'skip',
                topic: 'goals',
            }).success,
        ).toBe(true);
    });
    it('does not accept caller identity, provider settings, or portrait publication fields', () => {
        const base = {
            interviewId: '1e5b12a8-9dd1-4b17-a518-a5754283da1b',
            expectedVersion: 0,
            expectedGeneration: 0,
            idempotencyKey: '7ce48c11-c2ea-4dfd-a9ae-4a208b1f2b75',
            input: { kind: 'skip', topic: 'age' },
        };
        expect(SubmitPortraitInterviewSchema.safeParse(base).success).toBe(
            true,
        );
        for (const extra of [
            { ownerId: 'other' },
            { model: 'arbitrary' },
            { useEnabled: true },
        ])
            expect(
                SubmitPortraitInterviewSchema.safeParse({ ...base, ...extra })
                    .success,
            ).toBe(false);
    });
});
