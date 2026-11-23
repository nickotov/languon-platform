import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
    exerciseActivityCatalog,
    LearningBlockSchema,
} from '@languon/contracts';
import { namedExerciseFixture } from '../../../../../tests/support/named-exercise-fixture';
import {
    completeNamedExerciseSources as complete,
    type ExerciseAuthoringSource,
    namedExerciseAuthoringSchemaForBrief,
    prepareNamedExerciseBrief,
} from './exercise-authoring-context';
import { validateNamedExerciseActivity } from './exercise-activities';

import {
    createTutorRequestAgents,
    generateTutorObject,
} from './tutor-request-agents';
import { scriptedTutorModel } from './tutor-test-fixtures';
import { createLearningBlockRevisionWire } from './learning-block-revision-wire';
import { learningContentSchemaForBrief } from '../../application/learning-content-registry';

const languages = { language: 'fr', explanationLanguage: 'fr' };
function completeNamedExerciseSources(
    value: unknown,
    context: ExerciseAuthoringSource,
) {
    return complete(value, context, languages);
}

const vocabulary = LearningBlockSchema.parse({
    id: randomUUID(),
    type: 'vocabulary',
    language: 'fr',
    translationLanguage: 'en',
    entries: [{ id: randomUUID(), term: 'travail', translation: 'work' }],
});

describe('named exercise authoring context', () => {
    it.each(exerciseActivityCatalog)(
        'serializes, authors and validates $id through the production SDK',
        async (activity) => {
            const sources = [
                vocabulary,
                LearningBlockSchema.parse({
                    type: 'audio',
                    id: randomUUID(),
                    assetId: randomUUID(),
                    transcript: {
                        language: 'fr',
                        segments: [
                            {
                                id: randomUUID(),
                                text: 'Les citoyens votent.',
                                timing: { startSeconds: 0, endSeconds: 3 },
                            },
                        ],
                    },
                }),
                LearningBlockSchema.parse({
                    type: 'grammar',
                    id: randomUUID(),
                    language: 'fr',
                    rule: 'Le COD répond à qui ou quoi.',
                }),
                LearningBlockSchema.parse({
                    type: 'bilingual-text',
                    id: randomUUID(),
                    language: 'fr',
                    translations: [],
                    segments: [
                        {
                            id: randomUUID(),
                            text: 'Les citoyens votent pour élire les députés.',
                        },
                    ],
                }),
            ];
            const wire = namedExerciseFixture({
                activityId: activity.id,
                sources,
            });
            const task = {
                id: 'exercise',
                kind: 'exercises' as const,
                instruction: 'Practise.',
                ...languages,
                activities: [{ activityId: activity.id, count: 1 }],
            };
            const brief = { tasks: [task] };
            const itemSchema = namedExerciseAuthoringSchemaForBrief(
                brief,
                new Map([[task.id, { blocks: sources }]]),
            );
            const schema = learningContentSchemaForBrief(brief, itemSchema);
            const output = { tasks: [{ taskId: task.id, blocks: [wire] }] };
            const provider = scriptedTutorModel([JSON.stringify(output)]);
            const agents = createTutorRequestAgents({
                planningModel: provider.model,
                authoringModel: provider.model,
            });

            expect(
                await generateTutorObject({
                    agent: agents.learningContentAuthor,
                    prompt: 'Author the requested item.',
                    schema,
                    operationId: randomUUID(),
                    signal: new AbortController().signal,
                    maxOutputTokens: 2500,
                }),
            ).toEqual(output);

            const serialized = JSON.stringify(provider.requests[0]?.prompt);
            expect(serialized).toContain('sourceBindings');
            expect(serialized).toContain(activity.id);
            const block = completeNamedExerciseSources(wire, {
                blocks: sources,
            });

            expect(block).toMatchObject({
                format: activity.format,
                semantics: {
                    ...languages,
                    activity: { id: activity.id, version: activity.version },
                    checking: { policy: activity.checkingPolicy },
                },
            });

            if (block.type !== 'exercise') {
                throw new Error('Expected a compiled exercise.');
            }

            validateNamedExerciseActivity(block, sources);
            const { sources: _frozen, ...revisionSemantics } = block.semantics!;
            const revision = createLearningBlockRevisionWire([block]);
            const { source: _sourceLink, ...editable } = block;
            const candidate = { ...editable, semantics: revisionSemantics };
            expect(
                revision.decode({
                    proposals: [
                        { targetBlockId: block.id, blocks: [candidate] },
                    ],
                })[0]?.blocks,
            ).toEqual([block]);

            expect(
                itemSchema.safeParse({ ...wire, id: randomUUID() }).success,
            ).toBe(false);

            expect(() =>
                completeNamedExerciseSources(wire, { blocks: [] }),
            ).toThrow();

            const revealed = completeNamedExerciseSources(
                { ...wire, question: block.referenceAnswer },
                { blocks: sources },
            );

            if (revealed.type !== 'exercise') {
                throw new Error('Expected a compiled exercise.');
            }

            expect(() =>
                validateNamedExerciseActivity(revealed, sources),
            ).toThrow();

            if (activity.checkingPolicy === 'ai-rubric') {
                expect(
                    itemSchema.safeParse({
                        ...wire,
                        acceptedAnswers: ['fixed answer'],
                    }).success,
                ).toBe(false);

                expect(
                    itemSchema.safeParse({
                        ...wire,
                        rubric: { meaning: 'Preserve meaning.' },
                    }).success,
                ).toBe(false);
            }

            if (activity.id === 'R04') {
                const missingEvidence = {
                    ...wire,
                    rubric: {
                        'task-completion': 'Answer fully.',
                        meaning: 'Preserve meaning.',
                    },
                };

                expect(itemSchema.safeParse(missingEvidence).success).toBe(
                    false,
                );

                expect(serialized).toContain('evidence');
            }
        },
    );

    it('exposes only excerpt bindings when R04 depends on prose and verifies the chosen handle', () => {
        const task = {
            id: 'reading-check',
            kind: 'exercises' as const,
            instruction: 'Practise.',
            ...languages,
            activities: [{ activityId: 'R04' as const, count: 1 }],
        };
        const context: ExerciseAuthoringSource = {
            blocks: [],
            providedText: {
                materialId: randomUUID(),
                text: 'Les citoyens votent.',
            },
        };
        const schema = namedExerciseAuthoringSchemaForBrief(
            { tasks: [task] },
            new Map([[task.id, context]]),
        );
        const wire = {
            activityId: 'R04',
            objective: 'Explain civic participation.',
            question: 'Que font les citoyens ?',
            referenceAnswer: 'Ils votent.',
            explanation: 'Le texte décrit le vote.',
            rubric: {
                'task-completion': 'Répondre.',
                meaning: 'Préserver le sens.',
                evidence: 'Utiliser le texte.',
            },
            sourceBindings: [
                {
                    kind: 'text-selection',
                    sourceId: context.providedText!.materialId,
                },
            ],
        };

        expect(schema.safeParse(wire).success).toBe(true);
        expect(
            schema.safeParse({
                ...wire,
                sourceBindings: [
                    {
                        kind: 'text',
                        blockId: randomUUID(),
                        segmentIds: [randomUUID()],
                    },
                ],
            }).success,
        ).toBe(false);

        expect(completeNamedExerciseSources(wire, context)).toMatchObject({
            semantics: {
                sources: [
                    { kind: 'provided-text', text: 'Les citoyens votent.' },
                ],
            },
        });

        expect(() =>
            completeNamedExerciseSources(
                {
                    ...wire,
                    sourceBindings: [
                        { kind: 'text-selection', sourceId: randomUUID() },
                    ],
                },
                context,
            ),
        ).toThrow('unavailable or ambiguous');
    });

    it('binds the not-stated rationale and choice labels once for R03', () => {
        const reading = LearningBlockSchema.parse({
            id: randomUUID(),
            type: 'bilingual-text',
            language: 'fr',
            translations: [],
            segments: [{ id: randomUUID(), text: 'Les citoyens votent.' }],
        });
        const wire = {
            ...namedExerciseFixture({ activityId: 'R03', sources: [reading] }),
            correctRole: 'not-stated',
            reasons: {
                true: 'No support.',
                false: 'No contradiction.',
                'not-stated': 'The text does not specify the year.',
            },
        };
        const result = completeNamedExerciseSources(wire, {
            blocks: [reading],
        });

        expect(result).toMatchObject({
            referenceAnswer: 'Not stated',
            explanation: wire.reasons['not-stated'],
            semantics: {
                checking: {
                    key: {
                        classification: {
                            absenceRationale: wire.reasons['not-stated'],
                        },
                    },
                },
            },
        });

        if (result.type !== 'exercise') {
            throw new Error('Expected a compiled exercise.');
        }

        validateNamedExerciseActivity(result, [reading]);
    });

    it('builds each R08 gap and its answer key from a single grounded summary', () => {
        const reading = LearningBlockSchema.parse({
            id: randomUUID(),
            type: 'bilingual-text',
            language: 'fr',
            translations: [],
            segments: [
                {
                    id: randomUUID(),
                    text: 'Les citoyens votent pour élire les députés.',
                },
            ],
        });
        const wire = namedExerciseFixture({
            activityId: 'R08',
            sources: [reading],
        });
        const parts = [
            { kind: 'text', text: 'Les citoyens ' },
            {
                kind: 'gap',
                acceptedAnswers: ['votent'],
                explanation: 'Le texte décrit le vote.',
            },
            { kind: 'text', text: ' pour élire les ' },
            {
                kind: 'gap',
                acceptedAnswers: ['députés', 'représentants'],
                explanation: 'Les députés représentent les citoyens.',
            },
        ];
        const schema = namedExerciseAuthoringSchemaForBrief({
            tasks: [
                {
                    id: 'practice',
                    kind: 'exercises',
                    instruction: 'Complete the summary.',
                    language: 'fr',
                    explanationLanguage: 'fr',
                    activities: [{ activityId: 'R08', count: 1 }],
                },
            ],
        });
        const candidate = { ...wire, parts };
        expect(schema.safeParse(candidate).success).toBe(true);
        const context = { blocks: [reading] };
        const result = completeNamedExerciseSources(candidate, context);
        if (
            result.type !== 'exercise' ||
            result.format !== 'fill-in-the-blank'
        ) {
            throw new Error('Expected a gap exercise.');
        }

        const gaps = result.parts.filter((part) => part.kind === 'gap');
        expect(new Set(gaps.map((gap) => gap.id)).size).toBe(2);
        expect(result.semantics?.checking).toMatchObject({
            policy: 'hybrid',
            key: {
                kind: 'gaps',
                gaps: [
                    {
                        gapId: gaps[0]!.id,
                        acceptedAnswers: ['votent'],
                        explanation: parts[1]!.explanation,
                    },
                    {
                        gapId: gaps[1]!.id,
                        acceptedAnswers: ['députés', 'représentants'],
                        explanation: parts[3]!.explanation,
                    },
                ],
            },
        });

        expect(() =>
            validateNamedExerciseActivity(result, [reading]),
        ).not.toThrow();

        const forged = {
            ...candidate,
            semantics: {
                checking: result.semantics!.checking,
            },
        };

        expect(schema.safeParse(forged).success).toBe(false);
        expect(() => completeNamedExerciseSources(forged, context)).toThrow();
        expect(
            schema.safeParse({
                ...candidate,
                parts: [{ ...parts[1], id: randomUUID() }],
            }).success,
        ).toBe(false);

        expect(
            schema.safeParse({
                ...candidate,
                parts: [{ ...parts[1], acceptedAnswers: [] }],
            }).success,
        ).toBe(false);
    });

    it('accepts one compact G03 answer set and compiles its complete canonical text key', () => {
        const grammar = LearningBlockSchema.parse({
            id: randomUUID(),
            type: 'grammar',
            language: 'fr',
            rule: 'Le COD répond à qui ou quoi.',
        });
        const wire = namedExerciseFixture({
            activityId: 'G03',
            sources: [grammar],
        });

        if (!('acceptedAnswers' in wire) || !wire.acceptedAnswers) {
            throw new Error('Expected a prepared text interaction.');
        }

        wire.acceptedAnswers.push('une autre réponse');
        const schema = namedExerciseAuthoringSchemaForBrief({
            tasks: [
                {
                    id: 'practice',
                    kind: 'exercises',
                    instruction: 'Check the rule.',
                    language: 'fr',
                    explanationLanguage: 'fr',
                    activities: [{ activityId: 'G03', count: 1 }],
                },
            ],
        });

        expect(schema.safeParse(wire).success).toBe(true);
        expect(JSON.stringify(wire).match(/"acceptedAnswers"/gu)).toHaveLength(
            1,
        );

        expect(wire).not.toHaveProperty('semantics');
        const complete = completeNamedExerciseSources(wire, {
            blocks: [grammar],
        });

        expect(complete).toMatchObject({
            acceptedAnswers: wire.acceptedAnswers,
            semantics: {
                checking: {
                    policy: 'hybrid',
                    key: {
                        kind: 'text',
                        acceptedAnswers: wire.acceptedAnswers,
                    },
                    rubric: expect.anything(),
                },
            },
        });

        if (complete.type !== 'exercise') {
            throw new Error('Expected a validated exercise.');
        }

        expect(() =>
            validateNamedExerciseActivity(complete, [grammar]),
        ).not.toThrow();

        const withRepeatedKey = {
            ...wire,
            semantics: {
                checking: {
                    key: {
                        kind: 'text',
                        acceptedAnswers: wire.acceptedAnswers,
                    },
                },
            },
        };

        expect(schema.safeParse(withRepeatedKey).success).toBe(false);
        expect(() =>
            completeNamedExerciseSources(withRepeatedKey, {
                blocks: [grammar],
            }),
        ).toThrow();

        expect(schema.safeParse({ ...wire, acceptedAnswers: [] }).success).toBe(
            false,
        );

        expect(
            schema.safeParse({
                ...wire,
                acceptedAnswers: ['réponse', ' réponse '],
            }).success,
        ).toBe(false);

        expect(complete).toMatchObject({
            referenceAnswer: wire.acceptedAnswers[0],
        });
    });

    it('accepts only host-frozen source identities and refuses forged wire fields', () => {
        const wire = namedExerciseFixture({
            activityId: 'V07',
            sources: [vocabulary],
        });
        const complete = completeNamedExerciseSources(wire, {
            blocks: [vocabulary],
        });

        expect(complete.type).toBe('exercise');
        if (complete.type === 'exercise') {
            expect(complete.semantics?.sources[0]).toMatchObject({
                kind: 'vocabulary',
                entries: [{ term: 'travail', sense: 'work' }],
            });
        }

        expect(() =>
            completeNamedExerciseSources(
                {
                    ...wire,
                    sourceBindings: [
                        {
                            kind: 'vocabulary',
                            blockId: randomUUID(),
                            entryIds: [randomUUID()],
                        },
                    ],
                },
                { blocks: [vocabulary] },
            ),
        ).toThrow('authorized content');

        expect(() =>
            completeNamedExerciseSources(
                {
                    ...wire,
                    sourceBindings: [
                        { kind: 'grammar', blockId: vocabulary.id },
                    ],
                },
                { blocks: [vocabulary] },
            ),
        ).toThrow();

        expect(() =>
            completeNamedExerciseSources(
                { ...wire, semantics: { sources: [] } },
                { blocks: [vocabulary] },
            ),
        ).toThrow();
    });

    it('selects meaning questions for untimed multi-segment recordings and declines explicit decoding before authoring', () => {
        const audio = LearningBlockSchema.parse({
            id: randomUUID(),
            type: 'audio',
            assetId: randomUUID(),
            transcript: {
                language: 'fr',
                segments: [
                    { id: randomUUID(), text: 'Salut.' },
                    { id: randomUUID(), text: 'Bonjour.' },
                ],
            },
        });
        const task = {
            id: 'listen',
            kind: 'exercises' as const,
            instruction: 'Listen.',
            language: 'fr',
            count: 3,
            source: { kind: 'editor' as const, blockId: audio.id },
        };

        expect(
            prepareNamedExerciseBrief({ tasks: [task] }, new Map(), [audio]),
        ).toMatchObject({
            status: 'ready',
            brief: {
                tasks: [{ activities: [{ activityId: 'L01', count: 3 }] }],
            },
        });

        expect(
            prepareNamedExerciseBrief(
                {
                    tasks: [
                        {
                            ...task,
                            activities: [{ activityId: 'L02', count: 3 }],
                        },
                    ],
                },
                new Map(),
                [audio],
            ),
        ).toMatchObject({ status: 'needs-clarification' });
    });

    it('preserves explicit allocation and derives defaults only from eligible host sources', () => {
        const result = prepareNamedExerciseBrief(
            {
                tasks: [
                    {
                        id: 'exercise',
                        kind: 'exercises',
                        instruction: 'Practise.',
                        language: 'fr',
                        count: 2,
                        activities: [{ activityId: 'V07', count: 2 }],
                        source: { kind: 'editor', blockId: vocabulary.id },
                    },
                ],
            },
            new Map(),
            [vocabulary],
        );

        expect(result).toMatchObject({
            status: 'ready',
            brief: {
                tasks: [{ activities: [{ activityId: 'V07', count: 2 }] }],
            },
        });

        const defaults = prepareNamedExerciseBrief(
            {
                tasks: [
                    {
                        id: 'exercise',
                        kind: 'exercises',
                        instruction: 'Practise.',
                        language: 'fr',
                        count: 2,
                        source: { kind: 'editor', blockId: vocabulary.id },
                    },
                ],
            },
            new Map(),
            [vocabulary],
        );

        expect(defaults).toMatchObject({
            status: 'ready',
            brief: {
                tasks: [
                    {
                        activities: [
                            { activityId: 'V02', count: 1 },
                            { activityId: 'V03', count: 1 },
                        ],
                    },
                ],
            },
        });
    });
});
