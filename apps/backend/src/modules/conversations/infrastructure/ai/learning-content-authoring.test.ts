import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import {
    exerciseActivityCatalog,
    type LearningBlock,
} from '@languon/contracts';
import { namedExerciseFixture } from '../../../../../tests/support/named-exercise-fixture';
import {
    createLearningContentAuthoring,
    learningContentOutputSchema,
    type LearningContentModelCall,
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
const grammar = (): Extract<LearningBlock, { type: 'grammar' }> => ({
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
const output = (blocks: unknown[], taskId = 'words') => ({
    tasks: [{ taskId, blocks }],
});

function exercise(
    question: string,
    source: LearningBlock,
    groupId?: string,
    entryIndex = 0,
) {
    const selected =
        source.type === 'vocabulary'
            ? { ...source, entries: [source.entries[entryIndex]!] }
            : source;
    const block = namedExerciseFixture({
        activityId: source.type === 'vocabulary' ? 'V07' : 'R04',
        sources: [selected],
        language: 'en',
        explanationLanguage: 'en',
    });

    return {
        ...block,
        question,
        referenceAnswer:
            selected.type === 'vocabulary'
                ? `I use ${selected.entries[0]!.term} in this context.`
                : 'The apple is red.',
        ...(groupId ? { group: { id: groupId, title: 'Words' } } : {}),
    };
}

function sourceOptions(source: LearningBlock) {
    return {
        authorizedSources: [source],
        taskSources: new Map([['practice', { blocks: [source] }]]),
    };
}

describe('dedicated content authoring', () => {
    it('repairs an incomplete producer before exposing it to a dependent activity', async () => {
        const producer = grammar();
        const good = {
            ...producer,
            rule: 'Use the verb be in the present simple for singular subjects.',
        };
        const { rule: _missingRule, ...rest } = producer;
        const incomplete = {
            ...rest,
            examples: [{ id: randomUUID(), text: 'She is ready.' }],
        };
        const exercise = namedExerciseFixture({
            activityId: 'G02',
            sources: [good],
            language: 'en',
            explanationLanguage: 'en',
        });
        const generate = vi
            .fn()
            .mockResolvedValueOnce({
                tasks: [{ taskId: 'rule', blocks: [incomplete] }],
            })
            .mockResolvedValueOnce({
                tasks: [{ taskId: 'rule', blocks: [good] }],
            })
            .mockResolvedValueOnce({
                tasks: [{ taskId: 'practice', blocks: [exercise] }],
            });
        const result = await createLearningContentAuthoring({
            generate,
        }).generate(
            {
                tasks: [
                    {
                        id: 'rule',
                        kind: 'grammar',
                        instruction: 'Explain the present simple of be.',
                        language: 'en',
                    },
                    {
                        id: 'practice',
                        kind: 'exercises',
                        instruction: 'Supply the correct verb form.',
                        count: 1,
                        activities: [{ activityId: 'G02', count: 1 }],
                        language: 'en',
                        explanationLanguage: 'en',
                        source: { kind: 'task', taskId: 'rule' },
                    },
                ],
            },
            signal(),
        );

        expect(result.status).toBe('ready');
        expect(generate).toHaveBeenCalledTimes(3);
        if (result.status === 'ready') {
            expect(result.proposal.blocks[0]).toEqual(good);
            expect(result.proposal.blocks[1]?.type).toBe('exercise');
        }
    });

    it('repairs generated identities that collide with an exact external task source', async () => {
        const source = vocabulary(['apple']);
        const bad = {
            ...namedExerciseFixture({
                activityId: 'V07',
                sources: [source],
                language: 'en',
                explanationLanguage: 'en',
            }),
            id: source.id,
        };
        const good = namedExerciseFixture({
            activityId: 'V07',
            sources: [source],
            language: 'en',
            explanationLanguage: 'en',
        });
        const generate = vi
            .fn()
            .mockResolvedValueOnce({
                tasks: [{ taskId: 'practice', blocks: [bad] }],
            })
            .mockResolvedValueOnce({
                tasks: [{ taskId: 'practice', blocks: [good] }],
            });
        const result = await createLearningContentAuthoring({
            generate,
            taskSources: new Map([['practice', { blocks: [source] }]]),
        }).generate(
            {
                tasks: [
                    {
                        id: 'practice',
                        kind: 'exercises',
                        instruction:
                            'Write one contextual sentence with the word.',
                        count: 1,
                        activities: [{ activityId: 'V07', count: 1 }],
                        language: 'en',
                        explanationLanguage: 'en',
                        source: { kind: 'editor', blockId: source.id },
                    },
                ],
            },
            signal(),
        );

        expect(result.status).toBe('ready');
        expect(generate).toHaveBeenCalledTimes(2);
        if (result.status === 'ready') {
            expect(result.proposal.blocks[0]?.id).not.toBe(source.id);
        }
    });

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

    it('coordinates all requested types in brief order across the validated prerequisite boundary', async () => {
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
            activities: [{ activityId: 'V07', count: 1 }],
            source: { kind: 'task', taskId: 'words' },
        });

        const words = vocabulary();
        const generate = vi
            .fn()
            .mockResolvedValueOnce({
                tasks: [
                    { taskId: 'rule', blocks: [grammar()] },
                    { taskId: 'words', blocks: [words] },
                ],
            })
            .mockResolvedValueOnce(
                output(
                    [exercise('Write a sentence with apple.', words)],
                    'practice',
                ),
            );
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

        expect(generate).toHaveBeenCalledTimes(2);
        expect(generate.mock.calls[1]?.[0].prompt).toContain(words.id);
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
        const authoring = createLearningContentAuthoring({
            generate,
            ...sourceOptions(vocabulary()),
        });

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
        const source = vocabulary();
        const brief = {
            tasks: [
                {
                    id: 'practice',
                    kind: 'exercises',
                    instruction: 'Practise words.',
                    language: 'en',
                    count: 2,
                    activities: [{ activityId: 'V07' as const, count: 2 }],
                },
            ],
        };
        const groupId = randomUUID();
        const generate = vi.fn(async () =>
            output(
                [
                    exercise('Use apple.', source, groupId),
                    exercise('Use pear.', source, groupId, 1),
                ],
                'practice',
            ),
        );

        expect(
            (
                await createLearningContentAuthoring({
                    generate,
                    ...sourceOptions(source),
                }).generate(brief, signal())
            ).status,
        ).toBe('ready');

        const duplicate = vi.fn(async () =>
            output(
                [
                    exercise('Use apple.', source),
                    exercise('Use apple.', source),
                ],
                'practice',
            ),
        );

        expect(
            (
                await createLearningContentAuthoring({
                    generate: duplicate,
                    ...sourceOptions(source),
                }).generate(brief, signal())
            ).status,
        ).toBe('failed');
    });

    it('sends only selected activity instructions and checking schemas, then fills exact provenance on the host', async () => {
        const source = vocabulary(['apple']);
        const wire = exercise(
            'Write one sentence using apple with its selected meaning.',
            source,
        );
        const generate = vi.fn(async (_call: LearningContentModelCall) =>
            output([wire], 'practice'),
        );
        const result = await createLearningContentAuthoring({
            generate,
            ...sourceOptions(source),
        }).generate(
            {
                tasks: [
                    {
                        id: 'practice',
                        kind: 'exercises',
                        instruction: 'Use apple.',
                        language: 'en',
                        explanationLanguage: 'en',
                        count: 1,
                        activities: [{ activityId: 'V07', count: 1 }],
                    },
                ],
            },
            signal(),
        );

        expect(result.status).toBe('ready');
        expect(generate).toHaveBeenCalledOnce();
        const call = generate.mock.calls[0]![0];
        const schema = JSON.stringify(z.toJSONSchema(call.schema));
        expect(call.prompt).toContain('V07 v1:');
        expect(schema).toContain('V07');
        for (const { id } of exerciseActivityCatalog) {
            if (id !== 'V07') {
                expect(call.prompt).not.toContain(`${id} v1:`);
                expect(schema).not.toContain(`"${id}"`);
            }
        }

        expect(schema).not.toContain('prepared-key');
        expect(schema).not.toContain('correctChoiceId');
        expect(schema).not.toContain('gapId');
        expect(wire.semantics).not.toHaveProperty('sources');
        if (result.status !== 'ready' || source.type !== 'vocabulary') {
            throw new Error('Expected complete named exercise fixture.');
        }

        expect(result.proposal.blocks[0]).not.toHaveProperty('sourceBindings');
        expect(result.proposal.blocks[0]).toMatchObject({
            semantics: {
                sources: [
                    {
                        kind: 'vocabulary',
                        origin: { kind: 'block', blockId: source.id },
                        entries: [
                            {
                                entryId: source.entries[0]!.id,
                                term: 'apple',
                                sense: 'French apple',
                            },
                        ],
                    },
                ],
            },
        });
    });

    it('rejects invented source identities even when the block schema is valid', async () => {
        const source = vocabulary();
        const block = {
            ...exercise('Use apple.', source),
            source: { blockId: randomUUID(), segmentIds: [randomUUID()] },
        };
        const generate = vi.fn(async () => output([block], 'practice'));
        const result = await createLearningContentAuthoring({
            generate,
            ...sourceOptions(source),
        }).generate(
            {
                tasks: [
                    {
                        id: 'practice',
                        kind: 'exercises',
                        instruction: 'Practise.',
                        language: 'en',
                        count: 1,
                        activities: [{ activityId: 'V07', count: 1 }],
                    },
                ],
            },
            signal(),
        );

        expect(result.status).toBe('failed');
    });

    it('keeps schemas representable for the real provider and standalone tool registration', () => {
        const tools = createLearningContentTools({
            publish: async () => ({
                id: '01900000-0000-4000-8000-000000000002',
            }),
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
            publish: async () => ({
                id: '01900000-0000-4000-8000-000000000002',
            }),
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

        const question = {
            ...exercise('Describe the apple.', block),
            source: { blockId: block.id, segmentIds: [block.segments[0]!.id] },
        };

        const grounded = createLearningContentAuthoring({
            ...sourceOptions(block),
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
                                activities: [{ activityId: 'R04', count: 1 }],
                            },
                        ],
                    },
                    signal(),
                )
            ).status,
        ).toBe('ready');
    });

    it('rejects conflicting multiple-choice answers and duplicate choice text', async () => {
        const source = vocabulary();
        const block = namedExerciseFixture({
            activityId: 'V02',
            sources: [source],
            language: 'en',
            explanationLanguage: 'en',
        });

        block.referenceAnswer = block.choices![1]!.text;
        const authoring = createLearningContentAuthoring({
            generate: async () => output([block], 'practice'),
            ...sourceOptions(source),
        });
        const brief = {
            tasks: [
                {
                    id: 'practice',
                    kind: 'exercises',
                    instruction: 'Practise.',
                    language: 'en',
                    count: 1,
                    activities: [{ activityId: 'V02', count: 1 }],
                },
            ],
        };

        expect((await authoring.generate(brief, signal())).status).toBe(
            'failed',
        );

        block.referenceAnswer = block.choices![0]!.text;
        block.choices![1]!.text = block.choices![0]!.text;
        expect((await authoring.generate(brief, signal())).status).toBe(
            'failed',
        );
    });

    it('does not count a requested word mentioned only in explanatory metadata as exercise coverage', async () => {
        const source = vocabulary();
        const block = exercise('Write a sentence.', source);
        block.explanation = 'This mentions pear without using it in practice.';
        const authoring = createLearningContentAuthoring({
            generate: async () => output([block], 'practice'),
            ...sourceOptions(source),
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
                                activities: [{ activityId: 'V07', count: 1 }],
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

        const block = exercise('Use apple.', source);
        block.id = source.entries[0]!.id;
        const authoring = createLearningContentAuthoring({
            ...sourceOptions(source),
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
                        activities: [{ activityId: 'V07', count: 1 }],
                    },
                ],
            },
            signal(),
        );

        expect(result.status).toBe('failed');
    });
});
