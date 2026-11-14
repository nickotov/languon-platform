import { describe, expect, it } from 'vitest';
import {
    type ExerciseActivityFormat,
    type ExerciseActivityId,
    type ExerciseActivitySourceKind,
} from './exercise-activity';
import {
    exerciseActivityCatalog,
    getExerciseActivity,
} from './exercise-activity-catalog';
import {
    LearningBlockSchema,
    type ExerciseLearningBlock,
} from './learning-blocks';
import {
    NamedExerciseCheckingSchema,
    NamedExerciseKeySchema,
    NamedExerciseRubricSchema,
    NamedExerciseSemanticsSchema,
    NamedExerciseSourceSchema,
    type NamedExerciseKey,
    type NamedExerciseRubric,
    type NamedExerciseSource,
    type NamedExerciseSemantics,
} from './named-exercises';

const id = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const third = '33333333-3333-4333-8333-333333333333';

function sourceFor(kind: ExerciseActivitySourceKind): NamedExerciseSource {
    const origin = { kind: 'block' as const, blockId: id };
    if (kind === 'vocabulary') {
        return {
            kind,
            origin,
            entries: [
                { entryId: other, term: 'borrow', sense: 'Use temporarily.' },
            ],
        };
    }

    if (kind === 'grammar') {
        return {
            kind,
            origin,
            rule: 'Use the passive to focus on the receiver.',
        };
    }

    return {
        kind,
        origin,
        passages: [{ segmentId: other, text: 'Mira borrowed a book.' }],
    };
}

function keyFor(format: ExerciseActivityFormat): NamedExerciseKey {
    if (format === 'multiple-choice') {
        return {
            kind: 'choice',
            correctChoiceId: id,
            explanations: [
                {
                    choiceId: id,
                    explanation: 'This is supported by the material.',
                },
                {
                    choiceId: other,
                    explanation: 'This contradicts the material.',
                },
            ],
        };
    }

    if (format === 'fill-in-the-blank') {
        return {
            kind: 'gaps',
            gaps: [
                {
                    gapId: id,
                    acceptedAnswers: ['borrow'],
                    explanation: 'Temporary use.',
                },
            ],
        };
    }

    return { kind: 'text', acceptedAnswers: ['borrow'] };
}

function rubricFor(category: string): NamedExerciseRubric {
    const criteria: NamedExerciseRubric['criteria'] = [
        {
            dimension: 'task-completion',
            requirement: 'Complete the requested task.',
        },
        { dimension: 'meaning', requirement: 'Preserve the intended meaning.' },
    ];

    if (category === 'vocabulary' || category === 'grammar') {
        criteria.push({
            dimension: 'target-use',
            requirement: 'Use the target accurately.',
        });
    } else if (category === 'reading') {
        criteria.push({
            dimension: 'evidence',
            requirement: 'Support the answer with the passage.',
        });
    }

    return { criteria };
}

function specification(activityId: ExerciseActivityId = 'V01') {
    const activity = getExerciseActivity(activityId);
    const key: NamedExerciseKey =
        activityId === 'R03'
            ? {
                  kind: 'choice',
                  correctChoiceId: id,
                  explanations: [
                      {
                          choiceId: id,
                          explanation: 'The text supports the claim.',
                      },
                      {
                          choiceId: other,
                          explanation:
                              'The text does not contradict the claim.',
                      },
                      {
                          choiceId: third,
                          explanation:
                              'The text supplies the relevant information.',
                      },
                  ],
                  classification: {
                      roles: [
                          { choiceId: id, role: 'true' },
                          { choiceId: other, role: 'false' },
                          { choiceId: third, role: 'not-stated' },
                      ],
                  },
              }
            : keyFor(activity.format);
    const rubric = rubricFor(activity.category);
    const checking =
        activity.checkingPolicy === 'prepared-key'
            ? { policy: activity.checkingPolicy, key }
            : activity.checkingPolicy === 'hybrid'
              ? { policy: activity.checkingPolicy, key, rubric }
              : { policy: activity.checkingPolicy, rubric };

    return NamedExerciseSemanticsSchema.parse({
        activity: { id: activity.id, version: activity.version },
        objective: 'Practise the selected material.',
        language: 'en',
        explanationLanguage: 'fr',
        format: activity.format,
        checking,
        sources: [sourceFor(activity.supportedSourceKinds[0]!)],
    });
}

function namedBlock(
    activityId: ExerciseActivityId,
): ExerciseLearningBlock & { semantics: NamedExerciseSemantics } {
    const semantics = specification(activityId);
    const base = {
        id,
        type: 'exercise' as const,
        question: 'Practise the material.',
        referenceAnswer: activityId === 'R03' ? 'True' : 'A reference answer.',
        explanation: 'A prepared explanation.',
        semantics,
    };
    const checking = semantics.checking;
    if ('key' in checking && checking.key.kind === 'choice') {
        return {
            ...base,
            format: 'multiple-choice',
            choices: checking.key.explanations.map((item, index) => ({
                id: item.choiceId,
                text:
                    activityId === 'R03'
                        ? ['True', 'False', 'Not stated'][index]!
                        : `Choice ${index + 1}`,
            })),
            correctChoiceId: checking.key.correctChoiceId,
        };
    }

    if ('key' in checking && checking.key.kind === 'gaps') {
        return {
            ...base,
            format: 'fill-in-the-blank',
            parts: checking.key.gaps.map((gap) => ({
                kind: 'gap',
                id: gap.gapId,
                acceptedAnswers: gap.acceptedAnswers,
            })),
        };
    }

    return {
        ...base,
        format: 'free-text',
        ...('key' in checking && checking.key.kind === 'text'
            ? { acceptedAnswers: checking.key.acceptedAnswers }
            : {}),
    };
}

describe('standalone named exercise semantics', () => {
    it.each(exerciseActivityCatalog)(
        'accepts a complete specification for $id',
        (activity) => {
            expect(specification(activity.id).activity).toEqual({
                id: activity.id,
                version: 1,
            });
        },
    );

    it.each([
        { activity: { id: 'V04', version: 1 } },
        { activity: { id: 'V01', version: 2 } },
        { activity: { id: 'V01', version: 1, prompt: 'override' } },
        { activity: undefined },
        { objective: '   ' },
        { objective: 'x'.repeat(2_001) },
        { objective: '\u0000' },
        { objective: '\ud800' },
        { language: 'English!' },
        { explanationLanguage: '' },
        { checking: { policy: 'prepared-key', key: keyFor('free-text') } },
        { format: 'multiple-choice' },
        { sources: [] },
        { sources: [sourceFor('grammar')] },
        { ownerId: id },
        { prompt: 'override authoring' },
    ])('rejects missing, contradictory or foreign fields: %j', (patch) => {
        expect(
            NamedExerciseSemanticsSchema.safeParse({
                ...specification(),
                ...patch,
            }).success,
        ).toBe(false);
    });

    it('refuses a prepared key for the wrong interaction', () => {
        const input = specification('V02');
        expect(
            NamedExerciseSemanticsSchema.safeParse({
                ...input,
                checking: {
                    policy: 'prepared-key',
                    key: keyFor('fill-in-the-blank'),
                },
            }).success,
        ).toBe(false);
    });

    it('requires a rubric for hybrid alternatives and prohibits extra AI key fields', () => {
        expect(
            NamedExerciseCheckingSchema.safeParse({
                policy: 'hybrid',
                key: keyFor('free-text'),
            }).success,
        ).toBe(false);

        expect(
            NamedExerciseCheckingSchema.safeParse({
                policy: 'ai-rubric',
                rubric: rubricFor('writing'),
                key: keyFor('free-text'),
            }).success,
        ).toBe(false);
    });

    it('requires target-use and reading evidence criteria without conflating those objectives', () => {
        for (const activity of ['V01', 'G03', 'R04', 'R08'] as const) {
            const input = specification(activity);
            expect(
                NamedExerciseSemanticsSchema.safeParse({
                    ...input,
                    checking: {
                        ...input.checking,
                        rubric: rubricFor('writing'),
                    },
                }).success,
            ).toBe(false);
        }

        expect(specification('W01').checking.policy).toBe('ai-rubric');
    });

    it('accepts frozen selections for text activities and rejects them for vocabulary prerequisites', () => {
        const selected = {
            kind: 'text-selection',
            origin: { noteId: id, noteVersion: 3 },
            text: '  Mira borrowed a book.  ',
        };
        const result = NamedExerciseSemanticsSchema.parse({
            ...specification('R01'),
            sources: [selected],
        });

        expect(result.sources).toEqual([selected]);
        expect(
            NamedExerciseSemanticsSchema.safeParse({
                ...specification(),
                sources: [selected],
            }).success,
        ).toBe(false);
    });

    it('bounds aggregate frozen material even when individual fields are valid', () => {
        const source = sourceFor('vocabulary');
        const entries = Array.from({ length: 50 }, (_, index) => ({
            entryId: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
            term: 'x'.repeat(500),
            sense: 'x'.repeat(2_000),
        }));

        expect(
            NamedExerciseSourceSchema.safeParse({ ...source, entries }).success,
        ).toBe(true);

        expect(
            NamedExerciseSemanticsSchema.safeParse({
                ...specification(),
                sources: [{ ...source, entries }],
            }).success,
        ).toBe(false);
    });

    it('keeps literal source text but rejects malformed provenance and authority assertions', () => {
        const source = {
            kind: 'grammar',
            origin: { kind: 'proposal', proposalId: id, blockId: other },
            rule: '<script>literal</script>',
        };

        expect(NamedExerciseSourceSchema.parse(source)).toEqual(source);
        for (const patch of [
            { origin: { ...source.origin, ownerId: third } },
            { origin: { kind: 'proposal', blockId: other } },
            { origin: { kind: 'block', blockId: 'invented' } },
            { rule: '' },
            { html: '<script>' },
            { attemptId: third },
            { feedback: 'private feedback' },
        ]) {
            expect(
                NamedExerciseSourceSchema.safeParse({ ...source, ...patch })
                    .success,
            ).toBe(false);
        }

        const cyclic: { origin?: unknown } = {};
        cyclic.origin = cyclic;
        expect(NamedExerciseSourceSchema.safeParse(cyclic).success).toBe(false);
    });

    it('leaves Custom content valid and refuses unbound or misplaced named metadata', () => {
        const custom = {
            id,
            type: 'exercise',
            format: 'free-text',
            question: 'Explain.',
            referenceAnswer: 'Example.',
            explanation: 'Reason.',
        };

        expect(LearningBlockSchema.parse(custom)).toEqual(custom);
        for (const namedFields of [
            { semantics: specification() },
            { activity: { id: 'V01', version: 1 } },
            { checking: specification().checking },
        ]) {
            expect(
                LearningBlockSchema.safeParse({ ...custom, ...namedFields })
                    .success,
            ).toBe(false);
        }

        expect(NamedExerciseSemanticsSchema.safeParse(custom).success).toBe(
            false,
        );
    });

    it.each(exerciseActivityCatalog)(
        'binds $id to its actual interaction and prepared answer identities',
        (activity) => {
            const block = namedBlock(activity.id);
            expect(LearningBlockSchema.parse(block)).toEqual(block);
        },
    );

    it('rejects a named key that differs from the actual correct choice or explanation coverage', () => {
        const block = namedBlock('V02');
        expect(
            LearningBlockSchema.safeParse({ ...block, correctChoiceId: other })
                .success,
        ).toBe(false);

        expect(
            LearningBlockSchema.safeParse({
                ...block,
                choices: [
                    { id, text: 'First' },
                    { id: third, text: 'Missing explanation' },
                ],
            }).success,
        ).toBe(false);

        expect(
            LearningBlockSchema.safeParse({
                ...block,
                format: 'free-text',
                choices: undefined,
                correctChoiceId: undefined,
            }).success,
        ).toBe(false);
    });

    it('rejects missing, extra or contradictory prepared gap answers and identities', () => {
        const block = namedBlock('V03');
        for (const parts of [
            [{ kind: 'gap', id: third, acceptedAnswers: ['borrow'] }],
            [{ kind: 'gap', id, acceptedAnswers: ['steal'] }],
            [{ kind: 'gap', id, acceptedAnswers: ['borrow', 'steal'] }],
            [
                { kind: 'gap', id, acceptedAnswers: ['borrow'] },
                { kind: 'gap', id: third, acceptedAnswers: ['borrow'] },
            ],
        ]) {
            expect(
                LearningBlockSchema.safeParse({ ...block, parts }).success,
            ).toBe(false);
        }
    });

    it('requires matching hybrid text variants and keeps rubric-only content free of prepared variants', () => {
        const hybrid = namedBlock('V01');
        expect(
            LearningBlockSchema.safeParse({
                ...hybrid,
                acceptedAnswers: ['steal'],
            }).success,
        ).toBe(false);

        expect(
            LearningBlockSchema.safeParse({
                ...hybrid,
                acceptedAnswers: undefined,
            }).success,
        ).toBe(false);

        expect(
            LearningBlockSchema.safeParse({
                ...namedBlock('V07'),
                acceptedAnswers: ['borrow'],
            }).success,
        ).toBe(false);
    });
});

describe('prepared keys and rubric constraints', () => {
    it('requires R03 role identities to match the three canonical actual choices in order', () => {
        const block = namedBlock('R03');
        if (
            block.format !== 'multiple-choice' ||
            block.semantics.checking.policy !== 'prepared-key' ||
            block.semantics.checking.key.kind !== 'choice'
        ) {
            throw new Error('Unexpected classification fixture.');
        }

        const classification = block.semantics.checking.key.classification!;
        expect(LearningBlockSchema.parse(block)).toEqual(block);
        for (const choices of [
            [block.choices[1]!, block.choices[0]!, block.choices[2]!],
            block.choices.map((choice, index) => ({
                ...choice,
                text: ['Maybe', 'Never', 'Unknown'][index]!,
            })),
        ]) {
            expect(
                LearningBlockSchema.safeParse({ ...block, choices }).success,
            ).toBe(false);
        }

        expect(
            NamedExerciseSemanticsSchema.safeParse({
                ...block.semantics,
                checking: {
                    ...block.semantics.checking,
                    key: {
                        ...block.semantics.checking.key,
                        classification: {
                            roles: [
                                classification.roles[1],
                                classification.roles[0],
                                classification.roles[2],
                            ],
                        },
                    },
                },
            }).success,
        ).toBe(false);

        expect(
            NamedExerciseSemanticsSchema.safeParse({
                ...block.semantics,
                checking: {
                    ...block.semantics.checking,
                    key: {
                        ...block.semantics.checking.key,
                        classification: undefined,
                    },
                },
            }).success,
        ).toBe(false);
    });

    it('requires an explicit absence rationale tied to a correct Not stated choice explanation', () => {
        const block = namedBlock('R03');
        const checking = block.semantics.checking;
        if (
            checking.policy !== 'prepared-key' ||
            checking.key.kind !== 'choice'
        ) {
            throw new Error('Unexpected classification fixture.');
        }

        const absenceRationale =
            'The whole passage provides no information about the borrowing fee.';
        const key = {
            ...checking.key,
            correctChoiceId: third,
            explanations: checking.key.explanations.map((item) =>
                item.choiceId === third
                    ? { ...item, explanation: absenceRationale }
                    : item,
            ),
            classification: {
                ...checking.key.classification!,
                absenceRationale,
            },
        };
        const prepared = {
            ...block,
            correctChoiceId: third,
            referenceAnswer: 'Not stated',
            semantics: {
                ...block.semantics,
                checking: { policy: 'prepared-key', key },
            },
        };

        expect(LearningBlockSchema.parse(prepared)).toEqual(prepared);
        for (const rationale of [
            undefined,
            '',
            '   ',
            'Not the prepared explanation.',
            'x'.repeat(2_001),
        ]) {
            expect(
                LearningBlockSchema.safeParse({
                    ...prepared,
                    semantics: {
                        ...prepared.semantics,
                        checking: {
                            policy: 'prepared-key',
                            key: {
                                ...key,
                                classification: {
                                    ...key.classification,
                                    absenceRationale: rationale,
                                },
                            },
                        },
                    },
                }).success,
            ).toBe(false);
        }
    });

    it('does not require an absence rationale when True or False is the prepared correct role', () => {
        const block = namedBlock('R03');
        const checking = block.semantics.checking;
        if (
            checking.policy !== 'prepared-key' ||
            checking.key.kind !== 'choice'
        ) {
            throw new Error('Unexpected classification fixture.');
        }

        for (const [correctChoiceId, referenceAnswer] of [
            [id, 'True'],
            [other, 'False'],
        ]) {
            expect(
                LearningBlockSchema.safeParse({
                    ...block,
                    correctChoiceId,
                    referenceAnswer,
                    semantics: {
                        ...block.semantics,
                        checking: {
                            ...checking,
                            key: { ...checking.key, correctChoiceId },
                        },
                    },
                }).success,
            ).toBe(true);
        }
    });

    it('rejects classification metadata on every other activity', () => {
        const classification = specification('R03').checking;
        if (classification.policy !== 'prepared-key') {
            throw new Error('Unexpected classification fixture.');
        }

        const result = NamedExerciseSemanticsSchema.safeParse({
            ...specification('V02'),
            checking: classification,
        });

        expect(result.success).toBe(false);
        if (!result.success) {
            expect(
                result.error.issues.some(
                    (issue) =>
                        issue.path.join('.') === 'checking.key.classification',
                ),
            ).toBe(true);
        }
    });

    it('preserves meaningful case, accents, punctuation and script distinctions without rewriting answers', () => {
        const input = {
            kind: 'text',
            acceptedAnswers: [
                'café',
                'cafe',
                'CAFÉ',
                'café!',
                '猫',
                'ねこ',
                ' 借りる  ',
            ],
        };

        expect(NamedExerciseKeySchema.parse(input)).toEqual(input);
        expect(
            NamedExerciseKeySchema.safeParse({
                kind: 'text',
                acceptedAnswers: ['café', ' cafe\u0301 '],
            }).success,
        ).toBe(false);

        expect(
            NamedExerciseKeySchema.safeParse({
                kind: 'text',
                acceptedAnswers: ['a b', 'a\n b'],
            }).success,
        ).toBe(false);
    });

    it.each([
        { kind: 'text', acceptedAnswers: [] },
        { kind: 'text', acceptedAnswers: ['   '] },
        {
            kind: 'choice',
            correctChoiceId: third,
            explanations: [
                { choiceId: id, explanation: 'Yes' },
                { choiceId: other, explanation: 'No' },
            ],
        },
        {
            kind: 'choice',
            correctChoiceId: id,
            explanations: [
                { choiceId: id, explanation: 'Yes' },
                { choiceId: id, explanation: 'No' },
            ],
        },
        {
            kind: 'gaps',
            gaps: [{ gapId: id, acceptedAnswers: [], explanation: 'Why' }],
        },
        {
            kind: 'gaps',
            gaps: [
                { gapId: id, acceptedAnswers: ['a'], explanation: 'Why' },
                { gapId: id, acceptedAnswers: ['b'], explanation: 'Why' },
            ],
        },
    ])('rejects incomplete or ambiguous prepared keys: %j', (key) => {
        expect(NamedExerciseKeySchema.safeParse(key).success).toBe(false);
    });

    it('requires distinct rubric dimensions including task completion and meaning', () => {
        for (const criteria of [
            [{ dimension: 'meaning', requirement: 'Explain.' }],
            [
                { dimension: 'meaning', requirement: 'Explain.' },
                { dimension: 'meaning', requirement: 'Again.' },
            ],
            [
                { dimension: 'target-use', requirement: 'Explain.' },
                { dimension: 'evidence', requirement: 'Support.' },
            ],
        ]) {
            expect(
                NamedExerciseRubricSchema.safeParse({ criteria }).success,
            ).toBe(false);
        }
    });
});
