import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { LearningBlock } from '@languon/contracts';
import {
    createLearningContentAuthoring,
    learningContentOutputSchema,
} from './learning-content-authoring';
import { createLearningContentTools } from './learning-content-tools';
import {
    LearningContentBriefSchema,
    type LearningContentBrief,
} from '../../application/learning-content-contract';

const signal = () => new AbortController().signal;
const vocabulary = (terms = ['apple', 'pear']): LearningBlock => ({
    id: randomUUID(),
    type: 'vocabulary',
    language: 'en',
    translationLanguage: 'fr',
    entries: terms.map((term) => ({
        id: randomUUID(),
        term,
        translation: `French ${term}`,
    })),
});
const grammar = (): LearningBlock => ({
    id: randomUUID(),
    type: 'grammar',
    language: 'en',
    rule: 'Use a before consonant sounds.',
});
const vocabularyBrief = (): LearningContentBrief => ({
    tasks: [
        {
            id: 'words',
            kind: 'vocabulary',
            instruction: 'Prepare the supplied words.',
            language: 'en',
            translationLanguage: 'fr',
            words: ['apple', 'pear'],
        },
    ],
});
const output = (blocks: LearningBlock[], taskId = 'words') => ({
    tasks: [{ taskId, blocks }],
});
const exercise = (question: string, groupId?: string): LearningBlock => ({
    id: randomUUID(),
    type: 'exercise',
    format: 'free-text',
    question,
    referenceAnswer: 'apple',
    explanation: 'An example.',
    ...(groupId ? { group: { id: groupId, title: 'Words' } } : {}),
});

describe('dedicated content authoring', () => {
    it('returns exact validated vocabulary without a persistence dependency', async () => {
        const generate = vi.fn(async () => output([vocabulary()]));
        const result = await createLearningContentAuthoring({
            generate,
        }).generate(vocabularyBrief(), signal());

        expect(result.status).toBe('ready');
        expect(generate).toHaveBeenCalledOnce();
        expect(generate.mock.calls[0]).toBeDefined();
    });

    it('clarifies required languages before calling a model for any part of a mixed request', async () => {
        const generate = vi.fn();
        const brief = vocabularyBrief();
        delete brief.tasks[0]!.translationLanguage;
        brief.tasks.push({
            id: 'rule',
            kind: 'grammar',
            instruction: 'Prepare a rule.',
            language: 'en',
        });

        const result = await createLearningContentAuthoring({
            generate,
        }).generate(brief, signal());

        expect(result).toEqual({
            status: 'needs-clarification',
            missing: [{ taskId: 'words', fields: ['translationLanguage'] }],
        });

        expect(generate).not.toHaveBeenCalled();
    });

    it('coordinates all requested types in brief order in one model call', async () => {
        const brief = vocabularyBrief();
        brief.tasks.push({
            id: 'rule',
            kind: 'grammar',
            instruction: 'Make a rule.',
            language: 'en',
        });

        brief.tasks.push({
            id: 'practice',
            kind: 'exercises',
            instruction: 'Use apple.',
            language: 'en',
            words: ['apple'],
            count: 1,
            formats: ['free-text'],
        });

        const generate = vi.fn(async () => ({
            tasks: [
                {
                    taskId: 'practice',
                    blocks: [exercise('Write a sentence with apple.')],
                },
                { taskId: 'rule', blocks: [grammar()] },
                { taskId: 'words', blocks: [vocabulary()] },
            ],
        }));
        const result = await createLearningContentAuthoring({
            generate,
        }).generate(brief, signal());

        expect(result.status).toBe('ready');
        if (result.status === 'ready') {
            expect(result.proposal.blocks.map((block) => block.type)).toEqual([
                'vocabulary',
                'grammar',
                'exercise',
            ]);
        }

        expect(generate).toHaveBeenCalledOnce();
    });

    it('repairs a completed invalid candidate once and accepts only a complete result', async () => {
        const generate = vi
            .fn()
            .mockResolvedValueOnce(output([vocabulary(['apple'])]))
            .mockResolvedValueOnce(output([vocabulary()]));
        const result = await createLearningContentAuthoring({
            generate,
        }).generate(vocabularyBrief(), signal());

        expect(result.status).toBe('ready');
        expect(generate).toHaveBeenCalledTimes(2);
    });

    it.each([
        ['missing word', () => output([vocabulary(['apple'])])],
        [
            'unexpected word',
            () => output([vocabulary(['apple', 'pear', 'plum'])]),
        ],
        ['reordered words', () => output([vocabulary(['pear', 'apple'])])],
        ['wrong content kind', () => output([grammar()])],
        ['wrong task identity', () => output([vocabulary()], 'other')],
        ['Markdown substitution', () => 'apple | pomme'],
    ])('rejects %s after bounded repair', async (_label, createOutput) => {
        const generate = vi.fn(async () => createOutput());
        const result = await createLearningContentAuthoring({
            generate,
        }).generate(vocabularyBrief(), signal());

        expect(result).toEqual({ status: 'failed', reason: 'invalid-output' });
        expect(generate).toHaveBeenCalledTimes(2);
    });

    it('returns an unsupported format or oversized batch before dispatch', async () => {
        const generate = vi.fn();
        const brief = {
            tasks: [
                {
                    id: 'quiz',
                    kind: 'exercises',
                    instruction: 'Make exercises.',
                    language: 'en',
                    formats: ['crossword'],
                },
            ],
        };
        const authoring = createLearningContentAuthoring({ generate });

        expect((await authoring.generate(brief, signal())).status).toBe(
            'unsupported',
        );

        expect(
            (
                await authoring.generate(
                    {
                        tasks: [
                            {
                                ...brief.tasks[0],
                                formats: ['free-text'],
                                count: 26,
                            },
                        ],
                    },
                    signal(),
                )
            ).status,
        ).toBe('unsupported');

        expect(generate).not.toHaveBeenCalled();
    });

    it('propagates transport failure without repairing an ambiguous submission', async () => {
        const generate = vi.fn(async () => {
            throw new Error('Transport failed.');
        });

        await expect(
            createLearningContentAuthoring({ generate }).generate(
                vocabularyBrief(),
                signal(),
            ),
        ).rejects.toThrow('Transport failed.');

        expect(generate).toHaveBeenCalledOnce();
    });

    it('clarifies a count conflicting with explicit words without dropping words', async () => {
        const generate = vi.fn();
        const brief = vocabularyBrief();
        brief.tasks[0]!.count = 1;

        const result = await createLearningContentAuthoring({
            generate,
        }).generate(brief, signal());

        expect(result).toEqual({
            status: 'needs-clarification',
            missing: [{ taskId: 'words', fields: ['words', 'count'] }],
            code: 'word-count-conflict',
        });

        expect(generate).not.toHaveBeenCalled();
    });

    it('honors cancellation before dispatch and between model completion and acceptance', async () => {
        const controller = new AbortController();
        controller.abort();
        const generate = vi.fn(async () => output([vocabulary()]));
        await expect(
            createLearningContentAuthoring({ generate }).generate(
                vocabularyBrief(),
                controller.signal,
            ),
        ).rejects.toThrow();

        expect(generate).not.toHaveBeenCalled();

        const during = new AbortController();
        const authoring = createLearningContentAuthoring({
            generate: async () => {
                during.abort();

                return output([vocabulary()]);
            },
        });

        await expect(
            authoring.generate(vocabularyBrief(), during.signal),
        ).rejects.toThrow();
    });

    it('permits a consistent shared exercise group and rejects repeated questions', async () => {
        const brief = {
            tasks: [
                {
                    id: 'practice',
                    kind: 'exercises',
                    instruction: 'Practise words.',
                    language: 'en',
                    count: 2,
                    formats: ['free-text'],
                },
            ],
        };
        const groupId = randomUUID();
        const generate = vi.fn(async () =>
            output(
                [
                    exercise('Use apple.', groupId),
                    exercise('Use pear.', groupId),
                ],
                'practice',
            ),
        );

        expect(
            (
                await createLearningContentAuthoring({ generate }).generate(
                    brief,
                    signal(),
                )
            ).status,
        ).toBe('ready');

        const duplicate = vi.fn(async () =>
            output(
                [exercise('Use apple.'), exercise('Use apple.')],
                'practice',
            ),
        );

        expect(
            (
                await createLearningContentAuthoring({
                    generate: duplicate,
                }).generate(brief, signal())
            ).status,
        ).toBe('failed');
    });

    it('rejects invented source identities even when the block schema is valid', async () => {
        const block = exercise('Use apple.');
        if (block.type !== 'exercise') {
            throw new Error('Expected fixture exercise.');
        }

        block.source = { blockId: randomUUID(), segmentIds: [randomUUID()] };
        const generate = vi.fn(async () => output([block], 'practice'));
        const result = await createLearningContentAuthoring({
            generate,
        }).generate(
            {
                tasks: [
                    {
                        id: 'practice',
                        kind: 'exercises',
                        instruction: 'Practise.',
                        language: 'en',
                        count: 1,
                        formats: ['free-text'],
                    },
                ],
            },
            signal(),
        );

        expect(result.status).toBe('failed');
    });

    it('keeps schemas representable for the real provider and standalone tool registration', () => {
        const tools = createLearningContentTools({
            generate: vi.fn(),
            signal: signal(),
        });

        expect(Object.keys(tools)).toHaveLength(4);
        expect(
            JSON.stringify(z.toJSONSchema(learningContentOutputSchema)),
        ).toContain('referenceAnswer');

        expect(
            JSON.stringify(z.toJSONSchema(LearningContentBriefSchema)),
        ).toContain('translationLanguage');

        for (const tool of Object.values(tools)) {
            if (!(tool.inputSchema instanceof z.ZodType)) {
                throw new Error('Expected the registered Zod input schema.');
            }

            expect(
                JSON.stringify(z.toJSONSchema(tool.inputSchema)),
            ).not.toContain('blocks');
        }
    });

    it('invokes a dedicated standalone tool independently of conversation state', async () => {
        const generate = vi.fn(async () =>
            output([vocabulary()], 'requested-content'),
        );
        const tools = createLearningContentTools({
            generate,
            signal: signal(),
        });
        const result = await tools.generate_vocabulary.execute!(
            {
                instruction: 'Prepare these words.',
                language: 'en',
                translationLanguage: 'fr',
                words: ['apple', 'pear'],
            },
            {} as never,
        );

        expect(result).toHaveProperty('status', 'ready');
        expect(generate).toHaveBeenCalledOnce();
    });

    it('preserves bilingual source wording and accepts exact authorized passage references', async () => {
        const block: LearningBlock = {
            id: randomUUID(),
            type: 'bilingual-text',
            language: 'en',
            segments: [{ id: randomUUID(), text: 'An apple is red.' }],
            translations: [],
        };

        if (block.type !== 'bilingual-text') {
            throw new Error('Expected fixture text.');
        }

        block.translations = [
            {
                language: 'fr',
                segments: [
                    {
                        sourceSegmentId: block.segments[0]!.id,
                        text: 'Une pomme est rouge.',
                    },
                ],
            },
        ];

        const generate = vi.fn(async () => output([block], 'text'));
        const result = await createLearningContentAuthoring({
            generate,
        }).generate(
            {
                tasks: [
                    {
                        id: 'text',
                        kind: 'bilingual-text',
                        instruction: 'Translate.',
                        language: 'en',
                        translationLanguage: 'fr',
                        sourceText: 'An apple is red.',
                    },
                ],
            },
            signal(),
        );

        expect(result.status).toBe('ready');

        const question = exercise('Describe the apple.');
        if (question.type !== 'exercise') {
            throw new Error('Expected fixture exercise.');
        }

        question.source = {
            blockId: block.id,
            segmentIds: [block.segments[0]!.id],
        };

        const grounded = createLearningContentAuthoring({
            authorizedSources: [block],
            generate: async () => output([question], 'practice'),
        });

        expect(
            (
                await grounded.generate(
                    {
                        tasks: [
                            {
                                id: 'practice',
                                kind: 'exercises',
                                instruction: 'Practise.',
                                language: 'en',
                                count: 1,
                                formats: ['free-text'],
                            },
                        ],
                    },
                    signal(),
                )
            ).status,
        ).toBe('ready');
    });

    it('rejects conflicting multiple-choice answers and duplicate choice text', async () => {
        const firstId = randomUUID();
        const block: LearningBlock = {
            id: randomUUID(),
            type: 'exercise',
            format: 'multiple-choice',
            question: 'Choose a fruit.',
            choices: [
                { id: firstId, text: 'apple' },
                { id: randomUUID(), text: 'pear' },
            ],
            correctChoiceId: firstId,
            referenceAnswer: 'pear',
            explanation: 'A fruit.',
        };
        const authoring = createLearningContentAuthoring({
            generate: async () => output([block], 'practice'),
        });
        const brief = {
            tasks: [
                {
                    id: 'practice',
                    kind: 'exercises',
                    instruction: 'Practise.',
                    language: 'en',
                    count: 1,
                    formats: ['multiple-choice'],
                },
            ],
        };

        expect((await authoring.generate(brief, signal())).status).toBe(
            'failed',
        );
    });

    it('does not count a requested word mentioned only in explanatory metadata as exercise coverage', async () => {
        const block = exercise('Write a sentence.');
        if (block.type !== 'exercise') {
            throw new Error('Expected fixture exercise.');
        }

        block.explanation = 'This mentions pear without using it in practice.';
        const authoring = createLearningContentAuthoring({
            generate: async () => output([block], 'practice'),
        });

        expect(
            (
                await authoring.generate(
                    {
                        tasks: [
                            {
                                id: 'practice',
                                kind: 'exercises',
                                instruction: 'Practise.',
                                language: 'en',
                                words: ['pear'],
                                count: 1,
                                formats: ['free-text'],
                            },
                        ],
                    },
                    signal(),
                )
            ).status,
        ).toBe('failed');
    });

    it('rejects generated identities colliding with nested authorized source items', async () => {
        const source = vocabulary();
        if (source.type !== 'vocabulary') {
            throw new Error('Expected vocabulary fixture.');
        }

        const block = exercise('Use apple.');
        block.id = source.entries[0]!.id;
        const authoring = createLearningContentAuthoring({
            authorizedSources: [source],
            generate: async () => output([block], 'practice'),
        });

        const result = await authoring.generate(
            {
                tasks: [
                    {
                        id: 'practice',
                        kind: 'exercises',
                        instruction: 'Practise.',
                        language: 'en',
                        count: 1,
                        formats: ['free-text'],
                    },
                ],
            },
            signal(),
        );

        expect(result.status).toBe('failed');
    });
});
