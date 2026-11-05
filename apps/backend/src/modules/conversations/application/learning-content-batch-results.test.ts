import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { LearningBlock } from '@languon/contracts';
import type { LearningContentBrief } from './learning-content-contract';
import {
    mergeLearningContentBatchResults,
    type LearningContentTaskResult,
} from './learning-content-batch-results';
import { validateLearningContent } from './learning-content-validation';

const brief: LearningContentBrief = {
    tasks: [
        {
            id: 'words',
            kind: 'vocabulary',
            instruction: 'Shopping words.',
            language: 'en',
            translationLanguage: 'fr',
            count: 50,
        },
    ],
};
const vocabulary = (terms: string[]): LearningContentTaskResult => ({
    taskId: 'words',
    blocks: [
        {
            id: randomUUID(),
            type: 'vocabulary',
            language: 'en',
            translationLanguage: 'fr',
            entries: terms.map((term) => ({
                id: randomUUID(),
                term,
                translation: `French ${term}`,
            })),
        },
    ],
});
const terms = Array.from({ length: 50 }, (_, index) => `word-${index}`);

describe('learning content batch aggregation', () => {
    it('validates prefixes and produces exactly one complete vocabulary block', () => {
        const first = vocabulary(terms.slice(0, 31));
        const next = vocabulary(terms.slice(31));
        const before = structuredClone([brief, first, next]);
        const prefix = mergeLearningContentBatchResults(brief, [], [first]);

        expect(prefix.prefixBrief.tasks[0]!.count).toBe(31);
        expect(() =>
            validateLearningContent(prefix.prefixBrief, prefix.results),
        ).not.toThrow();

        const merged = mergeLearningContentBatchResults(brief, prefix.results, [
            next,
        ]);
        const proposal = validateLearningContent(brief, merged.results);
        expect(proposal.blocks).toHaveLength(1);
        expect(proposal.blocks[0]!.id).toBe(first.blocks[0]!.id);
        expect(proposal.blocks[0]).toMatchObject({
            entries: terms.map((term) => ({ term })),
        });

        expect([brief, first, next]).toEqual(before);
    });

    it('uses the exact supplied-word prefix during intermediate validation', () => {
        const exactBrief: LearningContentBrief = {
            tasks: [{ ...brief.tasks[0]!, words: terms }],
        };
        const prefix = mergeLearningContentBatchResults(
            exactBrief,
            [],
            [vocabulary(terms.slice(0, 31))],
        );

        expect(prefix.prefixBrief.tasks[0]!.words).toEqual(terms.slice(0, 31));
        expect(() =>
            validateLearningContent(prefix.prefixBrief, prefix.results),
        ).not.toThrow();

        expect(exactBrief.tasks[0]!.words).toHaveLength(50);
    });

    it.each(['term', 'id'] as const)(
        'rejects cross-batch duplicate %s without changing accepted progress',
        (duplicate) => {
            const first = vocabulary(terms.slice(0, 31));
            const next = vocabulary(terms.slice(31));
            const firstBlock = first.blocks[0]!;
            const nextBlock = next.blocks[0]!;
            if (
                firstBlock.type !== 'vocabulary' ||
                nextBlock.type !== 'vocabulary'
            ) {
                throw new Error('Invalid vocabulary fixture.');
            }

            nextBlock.entries[0]![duplicate] =
                firstBlock.entries[0]![duplicate];

            const accepted = mergeLearningContentBatchResults(
                brief,
                [],
                [first],
            );
            const before = structuredClone(accepted);
            const candidate = mergeLearningContentBatchResults(
                brief,
                accepted.results,
                [next],
            );

            expect(() =>
                validateLearningContent(
                    candidate.prefixBrief,
                    candidate.results,
                ),
            ).toThrow();

            expect(accepted).toEqual(before);
        },
    );

    it('preserves other task kinds and original ordering exactly once', () => {
        const rule: LearningBlock = {
            id: randomUUID(),
            type: 'grammar',
            language: 'en',
            rule: 'Use a question.',
        };
        const mixedBrief: LearningContentBrief = {
            tasks: [
                {
                    id: 'grammar',
                    kind: 'grammar',
                    instruction: 'Explain.',
                    language: 'en',
                },
                brief.tasks[0]!,
            ],
        };
        const first = mergeLearningContentBatchResults(
            mixedBrief,
            [],
            [
                vocabulary(terms.slice(0, 31)),
                { taskId: 'grammar', blocks: [rule] },
            ],
        );
        const final = mergeLearningContentBatchResults(
            mixedBrief,
            first.results,
            [vocabulary(terms.slice(31))],
        );

        expect(final.results.map((result) => result.taskId)).toEqual([
            'grammar',
            'words',
        ]);

        expect(
            validateLearningContent(mixedBrief, final.results).blocks[0],
        ).toEqual(rule);

        expect(() =>
            mergeLearningContentBatchResults(mixedBrief, final.results, [
                { taskId: 'grammar', blocks: [rule] },
            ]),
        ).toThrow('Only vocabulary');
    });
});
