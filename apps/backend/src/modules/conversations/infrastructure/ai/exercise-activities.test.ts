import { describe, expect, it } from 'vitest';
import {
    exerciseActivityCatalog,
    getExerciseActivity,
    NamedExerciseSemanticsSchema,
    type ExerciseActivityId,
    type ExerciseLearningBlock,
    type LearningBlock,
    type NamedExerciseKey,
    type NamedExerciseRubric,
    type NamedExerciseSemantics,
    type NamedExerciseSource,
} from '@languon/contracts';
import {
    buildExerciseActivityInstructions,
    getExerciseActivityDefinition,
    grammarExerciseSourceRule,
    NamedExerciseActivityValidationError,
    validateNamedExerciseActivity,
    vocabularyExerciseSourceSense,
} from './exercise-activities';

const ids = {
    exercise: '11111111-1111-4111-8111-111111111111',
    vocabulary: '22222222-2222-4222-8222-222222222222',
    grammar: '33333333-3333-4333-8333-333333333333',
    text: '44444444-4444-4444-8444-444444444444',
    segment: '55555555-5555-4555-8555-555555555555',
    borrow: '66666666-6666-4666-8666-666666666666',
    success: '77777777-7777-4777-8777-777777777777',
    decision: '88888888-8888-4888-8888-888888888888',
    return: '99999999-9999-4999-8999-999999999999',
    first: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    second: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    third: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    proposal: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
} as const;

const vocabulary: Extract<LearningBlock, { type: 'vocabulary' }> = {
    id: ids.vocabulary,
    type: 'vocabulary',
    language: 'en',
    translationLanguage: 'fr',
    entries: [
        {
            id: ids.borrow,
            term: 'borrow',
            translation: 'emprunter',
            definition: 'Use something temporarily and give it back.',
        },
        {
            id: ids.success,
            term: 'success',
            translation: 'réussite',
            definition: 'Achievement of the intended result.',
        },
        {
            id: ids.decision,
            term: 'decision',
            translation: 'décision',
            definition: 'A choice made after consideration.',
        },
        {
            id: ids.return,
            term: 'return',
            translation: 'rendre',
            definition: 'Give something back.',
        },
    ],
};
const grammar: Extract<LearningBlock, { type: 'grammar' }> = {
    id: ids.grammar,
    type: 'grammar',
    language: 'en',
    rule: 'Use be plus the past participle to focus on the receiver of an action. In the past, a singular subject takes was.',
    pattern: 'subject + was/were + past participle',
};
const text: Extract<LearningBlock, { type: 'bilingual-text' }> = {
    id: ids.text,
    type: 'bilingual-text',
    language: 'en',
    segments: [
        {
            id: ids.segment,
            text: 'Mira borrowed a book because the library was near her school. She returned it on Monday.',
        },
    ],
    translations: [],
};
const sourceBlocks: LearningBlock[] = [vocabulary, grammar, text];

type Scenario = {
    question: string;
    referenceAnswer: string;
    explanation: string;
    alternatives?: string[];
    correctIndex?: number;
    beforeGap?: string;
    afterGap?: string;
    variants?: string[];
    entryIds?: string[];
};

const scenarios: Record<ExerciseActivityId, Scenario> = {
    V01: {
        question:
            'Which word means to use something temporarily and give it back?',
        referenceAnswer: 'borrow',
        explanation:
            'Borrow means taking temporary use with an intention to give the item back.',
        variants: ['borrow'],
        entryIds: [ids.borrow],
    },
    V02: {
        question:
            'What does borrow mean in “Mira will borrow a book until Monday”?',
        referenceAnswer: 'Use temporarily and give back',
        explanation: 'Until Monday limits the use; the book must be returned.',
        alternatives: [
            'Use temporarily and give back',
            'Keep permanently',
            'Buy in a shop',
        ],
        entryIds: [ids.borrow],
    },
    V03: {
        question: 'Complete the sentence with the selected word.',
        referenceAnswer: 'borrow',
        explanation: 'The request asks for temporary use of the pen.',
        beforeGap: 'Can I ',
        afterGap: ' your pen until the end of the lesson?',
        variants: ['borrow'],
        entryIds: [ids.borrow],
    },
    V05: {
        question: 'Complete the natural word pair.',
        referenceAnswer: 'decision',
        explanation:
            'Make a decision is the natural pairing for choosing after consideration.',
        beforeGap: 'Please make a ',
        afterGap: ' before Monday.',
        variants: ['decision'],
        entryIds: [ids.decision],
    },
    V06: {
        question:
            'Use the adjective derived from success to complete the sentence.',
        referenceAnswer: 'successful',
        explanation: 'Successful is the adjective modifying project.',
        beforeGap: 'It was a ',
        afterGap: ' project.',
        variants: ['successful'],
        entryIds: [ids.success],
    },
    V07: {
        question:
            'Write a short message asking a classmate to lend you a book. Use borrow and return with their selected meanings.',
        referenceAnswer: 'Can I borrow your book? I will return it on Monday.',
        explanation:
            'The message requests temporary use and promises to give the book back.',
        entryIds: [ids.borrow, ids.return],
    },
    G01: {
        question:
            'The subject is the book. Choose the past passive form: The book ___ by Mira yesterday.',
        referenceAnswer: 'was borrowed',
        explanation:
            'A singular past passive subject needs was plus the past participle.',
        alternatives: ['was borrowed', 'were borrowed', 'is borrowing'],
    },
    G02: {
        question: 'Complete the singular past passive using borrow.',
        referenceAnswer: 'was borrowed',
        explanation: 'Book is singular; was borrowed is the past passive.',
        beforeGap: 'The book ',
        afterGap: ' by Mira yesterday.',
        variants: ['was borrowed'],
    },
    G03: {
        question:
            'Rewrite “Mira borrowed the book yesterday” in the passive. Preserve the past time and the borrower.',
        referenceAnswer: 'The book was borrowed by Mira yesterday.',
        explanation:
            'The book becomes the passive subject; by Mira preserves the agent and yesterday the time.',
        variants: [
            'The book was borrowed by Mira yesterday.',
            'Yesterday, the book was borrowed by Mira.',
        ],
    },
    G04: {
        question:
            'Correct the passive agreement error: “The book were borrowed by Mira yesterday.” Preserve the meaning.',
        referenceAnswer: 'The book was borrowed by Mira yesterday.',
        explanation: 'The singular subject book requires was rather than were.',
        variants: ['The book was borrowed by Mira yesterday.'],
    },
    G06: {
        question: 'What does “The book was borrowed by Mira” mean?',
        referenceAnswer: 'Mira took temporary use of the book.',
        explanation:
            'The passive still identifies Mira as the person who borrowed the book.',
        alternatives: [
            'Mira took temporary use of the book.',
            'Mira permanently owned the book.',
            'The book borrowed something from Mira.',
        ],
    },
    G07: {
        question:
            'A librarian asks what happened to the book yesterday. Reply using the past passive and mention Mira as the borrower.',
        referenceAnswer: 'The book was borrowed by Mira yesterday.',
        explanation:
            'The response reports the event using was plus the past participle and keeps the borrower explicit.',
    },
    R01: {
        question: 'Which option best states the main idea of the passage?',
        referenceAnswer: 'Mira borrowed and returned a library book.',
        explanation:
            'Borrowing and returning the book cover the passage; the location explains why she used that library.',
        alternatives: [
            'Mira borrowed and returned a library book.',
            'Mira worked in a distant bookshop.',
            'Mira lost her school books.',
        ],
    },
    R02: {
        question: 'On which day did Mira return the book?',
        referenceAnswer: 'Monday',
        explanation: 'The passage explicitly says she returned it on Monday.',
        alternatives: ['Monday', 'Friday', 'Sunday'],
    },
    R03: {
        question: 'Claim: Mira paid a fee to borrow the book.',
        referenceAnswer: 'Not stated',
        explanation:
            'The passage says why she used the library and when she returned the book, but it supplies no information about borrowing fees.',
        alternatives: ['True', 'False', 'Not stated'],
        correctIndex: 2,
    },
    R04: {
        question:
            'Why did Mira choose this library? Explain in your own words.',
        referenceAnswer: 'It was close to her school.',
        explanation:
            'Near her school supports proximity as her reason; a paraphrase is sufficient.',
    },
    R08: {
        question: 'Complete the summary using information from the passage.',
        referenceAnswer: 'library',
        explanation:
            'The source identifies the library near Mira’s school as the place she borrowed the book.',
        beforeGap: 'Mira borrowed a book from the ',
        afterGap: ' near her school and returned it on Monday.',
        variants: ['library'],
    },
    R09: {
        question:
            'Summarize the passage for a classmate in one short sentence, retaining the borrowing, reason and return day.',
        referenceAnswer:
            'Mira borrowed a book from the library near her school and returned it on Monday.',
        explanation:
            'The summary retains the central action, convenient location and return day without inventing facts.',
    },
    W01: {
        question:
            'Translate the message into French in a neutral register. Preserve who borrowed what and the Monday return.',
        referenceAnswer: 'Mira a emprunté un livre et l’a rendu lundi.',
        explanation:
            'The translation preserves Mira, the book, and the return on Monday without adding a fee or another event.',
    },
};

type NamedExercise = ExerciseLearningBlock & {
    semantics: NamedExerciseSemantics;
};

function sourceFor(id: ExerciseActivityId): NamedExerciseSource {
    const metadata = getExerciseActivity(id);
    if (metadata.category === 'vocabulary') {
        return {
            kind: 'vocabulary',
            origin: { kind: 'block', blockId: vocabulary.id },
            entries: vocabulary.entries
                .filter((entry) => scenarios[id].entryIds!.includes(entry.id))
                .map((entry) => ({
                    entryId: entry.id,
                    term: entry.term,
                    sense: vocabularyExerciseSourceSense(entry),
                })),
        };
    }

    if (metadata.category === 'grammar') {
        return {
            kind: 'grammar',
            origin: { kind: 'block', blockId: grammar.id },
            rule: grammarExerciseSourceRule(grammar),
        };
    }

    return {
        kind: 'text',
        origin: { kind: 'block', blockId: text.id },
        passages: text.segments.map((segment) => ({
            segmentId: segment.id,
            text: segment.text,
        })),
    };
}

function rubricFor(id: ExerciseActivityId): NamedExerciseRubric {
    const metadata = getExerciseActivity(id);
    const scenario = scenarios[id];
    const criteria: NamedExerciseRubric['criteria'] = [
        { dimension: 'task-completion', requirement: scenario.question },
        { dimension: 'meaning', requirement: scenario.explanation },
    ];

    if (metadata.category === 'vocabulary' || metadata.category === 'grammar') {
        criteria.push({
            dimension: 'target-use',
            requirement:
                metadata.category === 'vocabulary'
                    ? 'Use the selected vocabulary with the frozen senses.'
                    : grammar.rule!,
        });
    } else if (metadata.category === 'reading') {
        criteria.push({
            dimension: 'evidence',
            requirement: text.segments[0]!.text,
        });
    }

    return { criteria };
}

function fixture(id: ExerciseActivityId): NamedExercise {
    const metadata = getExerciseActivity(id);
    const scenario = scenarios[id];
    const base = {
        id: ids.exercise,
        type: 'exercise' as const,
        question: scenario.question,
        referenceAnswer: scenario.referenceAnswer,
        explanation: scenario.explanation,
    };
    let block: ExerciseLearningBlock;
    let key: NamedExerciseKey;
    if (metadata.format === 'multiple-choice') {
        const choiceIds = [ids.first, ids.second, ids.third];
        const choices = scenario.alternatives!.map((value, index) => ({
            id: choiceIds[index]!,
            text: value,
        }));
        const correctChoiceId = choices[scenario.correctIndex ?? 0]!.id;
        block = {
            ...base,
            format: 'multiple-choice',
            choices,
            correctChoiceId,
        };

        key = {
            kind: 'choice',
            correctChoiceId,
            ...(id === 'R03'
                ? {
                      classification: {
                          roles: choices.map((choice, index) => ({
                              choiceId: choice.id,
                              role: (['true', 'false', 'not-stated'] as const)[
                                  index
                              ]!,
                          })),
                          ...(scenario.correctIndex === 2
                              ? { absenceRationale: scenario.explanation }
                              : {}),
                      },
                  }
                : {}),
            explanations: choices.map((choice) => ({
                choiceId: choice.id,
                explanation:
                    choice.id === correctChoiceId
                        ? scenario.explanation
                        : 'This alternative does not express the selected source meaning.',
            })),
        };
    } else if (metadata.format === 'fill-in-the-blank') {
        block = {
            ...base,
            format: 'fill-in-the-blank',
            parts: [
                { kind: 'text', text: scenario.beforeGap! },
                {
                    kind: 'gap',
                    id: ids.first,
                    acceptedAnswers: scenario.variants!,
                },
                { kind: 'text', text: scenario.afterGap! },
            ],
        };

        key = {
            kind: 'gaps',
            gaps: [
                {
                    gapId: ids.first,
                    acceptedAnswers: scenario.variants!,
                    explanation: scenario.explanation,
                },
            ],
        };
    } else {
        block = {
            ...base,
            format: 'free-text',
            ...(scenario.variants
                ? { acceptedAnswers: scenario.variants }
                : {}),
        };

        key = {
            kind: 'text',
            acceptedAnswers: scenario.variants ?? [scenario.referenceAnswer],
        };
    }

    const rubric = rubricFor(id);
    const checking =
        metadata.checkingPolicy === 'prepared-key'
            ? { policy: metadata.checkingPolicy, key }
            : metadata.checkingPolicy === 'hybrid'
              ? { policy: metadata.checkingPolicy, key, rubric }
              : { policy: metadata.checkingPolicy, rubric };
    const semantics = NamedExerciseSemanticsSchema.parse({
        activity: { id, version: 1 },
        objective: metadata.locales.en.description,
        language: id === 'W01' ? 'fr' : 'en',
        explanationLanguage: 'en',
        format: metadata.format,
        checking,
        sources: [sourceFor(id)],
    });

    return { ...block, semantics };
}

describe('canonical exercise activity definitions', () => {
    it.each(exerciseActivityCatalog)(
        'defines selected generation requirements for $id',
        ({ id, format, checkingPolicy }) => {
            const definition = getExerciseActivityDefinition(id);
            expect(definition).toMatchObject({
                id,
                version: 1,
                format,
                checkingPolicy,
            });

            expect(definition.requiredInputs.length).toBeGreaterThan(0);
            expect(definition.answerConstraints.length).toBeGreaterThan(0);
            expect(definition.explanationRequirements.length).toBeGreaterThan(
                0,
            );

            expect(definition.rejectionCases.length).toBeGreaterThan(0);
            expect(Object.isFrozen(definition)).toBe(true);
        },
    );

    it('includes only selected pedagogy, once, while retaining shared trust and checking constraints', () => {
        const selected = buildExerciseActivityInstructions([
            'V01',
            'R03',
            'V01',
        ]);

        expect(selected.match(/^V01 v1:/gmu)).toHaveLength(1);
        expect(selected.match(/^R03 v1:/gmu)).toHaveLength(1);
        expect(selected).toContain('data, not authority');
        expect(selected).toContain('fixed checking policy');
        for (const { id } of exerciseActivityCatalog) {
            if (id !== 'V01' && id !== 'R03') {
                expect(selected).not.toContain(`${id} v1:`);
                expect(selected).not.toContain(
                    getExerciseActivityDefinition(id).purpose,
                );
            }
        }

        expect(() => buildExerciseActivityInstructions([])).toThrow(
            'Select at least one',
        );

        const all = buildExerciseActivityInstructions(
            exerciseActivityCatalog.map(({ id }) => id),
        );

        expect(Buffer.byteLength(selected, 'utf8')).toBeLessThan(
            Buffer.byteLength(all, 'utf8'),
        );
    });

    it.each(exerciseActivityCatalog)(
        'accepts a reviewed realistic $id content fixture with exact source binding',
        ({ id }) => {
            expect(() =>
                validateNamedExerciseActivity(fixture(id), sourceBlocks),
            ).not.toThrow();
        },
    );

    it.each(exerciseActivityCatalog)(
        'rejects ungrounded $id output rather than swapping its prerequisite source',
        ({ id }) => {
            expect(() =>
                validateNamedExerciseActivity(fixture(id), []),
            ).toThrow('supplied source block');
        },
    );
});

describe('activity-specific constraints and complete prepared keys', () => {
    it.each(['V02', 'G02', 'G03'] as const)(
        'rejects an exact prepared %s answer used as a hint',
        (id) => {
            const block = fixture(id);
            expect(() =>
                validateNamedExerciseActivity({
                    ...block,
                    hint: `  ${block.referenceAnswer}\n`,
                }),
            ).toThrow('hint must not consist');
        },
    );

    it.each(['V02', 'G02', 'G03'] as const)(
        'rejects explicit %s answer-key disclosure inside a question or hint',
        (id) => {
            const block = fixture(id);
            expect(() =>
                validateNamedExerciseActivity({
                    ...block,
                    question: `${block.question} Answer: ${block.referenceAnswer}`,
                }),
            ).toThrow('explicitly disclose');

            expect(() =>
                validateNamedExerciseActivity({
                    ...block,
                    hint: `The correct answer is “${block.referenceAnswer}”.`,
                }),
            ).toThrow('explicitly disclose');
        },
    );

    it('allows source words, supplied grammar lemmas and partial form cues without treating them as leaked keys', () => {
        expect(() =>
            validateNamedExerciseActivity(fixture('V02')),
        ).not.toThrow();

        expect(() =>
            validateNamedExerciseActivity({
                ...fixture('G02'),
                hint: 'Use borrow as the supplied lemma and consider singular past time.',
            }),
        ).not.toThrow();

        expect(() =>
            validateNamedExerciseActivity({
                ...fixture('V06'),
                hint: 'Starts with s and has ten letters.',
            }),
        ).not.toThrow();
    });

    it('rejects reordered or arbitrary R03 labels even when the answer key still names the correct actual choice', () => {
        const block = fixture('R03');
        if (block.format !== 'multiple-choice') {
            throw new Error('Invalid fixture.');
        }

        for (const choices of [
            [block.choices[1]!, block.choices[0]!, block.choices[2]!],
            block.choices.map((choice, index) => ({
                ...choice,
                text: index === 0 ? 'Maybe' : choice.text,
            })),
        ]) {
            expect(() =>
                validateNamedExerciseActivity({ ...block, choices }),
            ).toThrow('canonical ordered choices');
        }
    });

    it('rejects a correct Not stated key without the explicit matching absence rationale', () => {
        const block = fixture('R03');
        const checking = block.semantics.checking;
        if (
            checking.policy !== 'prepared-key' ||
            checking.key.kind !== 'choice'
        ) {
            throw new Error('Invalid fixture.');
        }

        for (const absenceRationale of [
            undefined,
            '',
            'This rationale differs from its prepared explanation.',
        ]) {
            const invalid = {
                ...block,
                semantics: {
                    ...block.semantics,
                    checking: {
                        ...checking,
                        key: {
                            ...checking.key,
                            classification: {
                                ...checking.key.classification!,
                                absenceRationale,
                            },
                        },
                    },
                },
            };

            expect(() => validateNamedExerciseActivity(invalid)).toThrow(
                'complete valid catalog semantics',
            );
        }
    });

    it('accepts supported True and contradicted False R03 claims without requiring an absence rationale', () => {
        const block = fixture('R03');
        const checking = block.semantics.checking;
        if (
            block.format !== 'multiple-choice' ||
            checking.policy !== 'prepared-key' ||
            checking.key.kind !== 'choice'
        ) {
            throw new Error('Invalid fixture.');
        }

        for (const scenario of [
            {
                index: 0,
                question: 'Claim: Mira borrowed a book.',
                explanation: 'The source explicitly says Mira borrowed a book.',
            },
            {
                index: 1,
                question: 'Claim: Mira returned the book on Sunday.',
                explanation: 'The source gives Monday, contradicting Sunday.',
            },
        ]) {
            const correctChoiceId = block.choices[scenario.index]!.id;
            const valid = {
                ...block,
                question: scenario.question,
                referenceAnswer: block.choices[scenario.index]!.text,
                correctChoiceId,
                semantics: {
                    ...block.semantics,
                    checking: {
                        ...checking,
                        key: {
                            ...checking.key,
                            correctChoiceId,
                            explanations: checking.key.explanations.map(
                                (item) =>
                                    item.choiceId === correctChoiceId
                                        ? {
                                              ...item,
                                              explanation: scenario.explanation,
                                          }
                                        : item,
                            ),
                            classification: {
                                roles: checking.key.classification!.roles,
                            },
                        },
                    },
                },
            };

            expect(() =>
                validateNamedExerciseActivity(valid, sourceBlocks),
            ).not.toThrow();
        }
    });

    it('rejects recall that discloses the target or accepts an unrelated word', () => {
        const block = fixture('V01');
        expect(() =>
            validateNamedExerciseActivity({
                ...block,
                hint: 'The answer is “borrow”.',
            }),
        ).toThrow('must not reveal');

        if (
            block.format !== 'free-text' ||
            block.semantics.checking.policy !== 'hybrid'
        ) {
            throw new Error('Invalid fixture.');
        }

        block.acceptedAnswers = ['keep'];
        block.referenceAnswer = 'keep';
        block.semantics.checking.key = {
            kind: 'text',
            acceptedAnswers: ['keep'],
        };

        expect(() => validateNamedExerciseActivity(block)).toThrow(
            'exact selected source term',
        );
    });

    it('requires a single explicit target for recall/meaning/form and shows the word-form lemma', () => {
        for (const id of ['V01', 'V02', 'V06'] as const) {
            const block = fixture(id);
            block.semantics.sources = [sourceFor('V07')];
            expect(() => validateNamedExerciseActivity(block)).toThrow(
                'exactly one selected',
            );
        }

        expect(() =>
            validateNamedExerciseActivity({
                ...fixture('V06'),
                question: 'Supply the missing adjective.',
            }),
        ).toThrow('show the selected base word');
    });

    it.each(['V03', 'V05', 'V06', 'G02', 'R08'] as const)(
        'rejects %s blanks without meaningful context',
        (id) => {
            const block = fixture(id);
            if (block.format !== 'fill-in-the-blank') {
                throw new Error('Invalid fixture.');
            }

            block.parts = block.parts.filter((part) => part.kind === 'gap');
            expect(() => validateNamedExerciseActivity(block)).toThrow(
                'meaningful visible',
            );
        },
    );

    it('rejects choice duplicates under NFC and whitespace normalization', () => {
        const block = fixture('V02');
        if (block.format !== 'multiple-choice') {
            throw new Error('Invalid fixture.');
        }

        block.choices[1]!.text = ` ${block.choices[0]!.text}\n`;
        expect(() => validateNamedExerciseActivity(block)).toThrow(
            'must be distinct',
        );
    });

    it('requires exactly three True/False/Not-stated choices with an explanation for each', () => {
        const block = fixture('R03');
        if (
            block.format !== 'multiple-choice' ||
            block.semantics.checking.policy !== 'prepared-key' ||
            block.semantics.checking.key.kind !== 'choice'
        ) {
            throw new Error('Invalid fixture.');
        }

        block.choices.shift();
        expect(() => validateNamedExerciseActivity(block)).toThrow(
            'Prepared choice key must cover exactly the actual choices',
        );
    });

    it('rejects foreign choice identities, missing distractor rationales and inconsistent reference answers', () => {
        const block = fixture('G01');
        if (
            block.format !== 'multiple-choice' ||
            block.semantics.checking.policy !== 'prepared-key' ||
            block.semantics.checking.key.kind !== 'choice'
        ) {
            throw new Error('Invalid fixture.');
        }

        block.semantics.checking.key.explanations[1]!.choiceId = ids.proposal;
        expect(() => validateNamedExerciseActivity(block)).toThrow(
            'actual choices',
        );

        expect(() =>
            validateNamedExerciseActivity({
                ...fixture('G06'),
                referenceAnswer: 'Some different interpretation.',
            }),
        ).toThrow('Reference answer');
    });

    it('rejects gap keys that silently refer to another question or permit different variants', () => {
        const block = fixture('G02');
        if (
            block.semantics.checking.policy !== 'prepared-key' ||
            block.semantics.checking.key.kind !== 'gaps'
        ) {
            throw new Error('Invalid fixture.');
        }

        block.semantics.checking.key.gaps[0]!.gapId = ids.proposal;
        expect(() => validateNamedExerciseActivity(block)).toThrow(
            'actual gaps',
        );

        block.semantics.checking.key.gaps[0]!.gapId = ids.first;
        block.semantics.checking.key.gaps[0]!.acceptedAnswers = [
            'were borrowed',
        ];

        expect(() => validateNamedExerciseActivity(block)).toThrow(
            'accepted variants exactly',
        );
    });

    it.each(['G03', 'G04'] as const)(
        'rejects %s prepared variants that omit the exemplar or lack target-form assessment',
        (id) => {
            const block = fixture(id);
            expect(() =>
                validateNamedExerciseActivity({
                    ...block,
                    referenceAnswer: 'Some other sentence.',
                }),
            ).toThrow('reference answer');

            if (!('rubric' in block.semantics.checking)) {
                throw new Error('Invalid fixture.');
            }

            block.semantics.checking.rubric.criteria =
                block.semantics.checking.rubric.criteria.filter(
                    (criterion) => criterion.dimension !== 'target-use',
                );

            expect(() => validateNamedExerciseActivity(block)).toThrow(
                'complete valid catalog semantics',
            );
        },
    );

    it.each(['V07', 'G07', 'R04', 'R09', 'W01'] as const)(
        'does not permit %s to choose prepared-only checking',
        (id) => {
            const block = fixture(id);
            block.semantics.checking = {
                policy: 'prepared-key',
                key: { kind: 'text', acceptedAnswers: [block.referenceAnswer] },
            };

            expect(() => validateNamedExerciseActivity(block)).toThrow(
                'complete valid catalog semantics',
            );
        },
    );

    it('requires passage evidence in open comprehension and summary rubrics', () => {
        for (const id of ['R04', 'R08', 'R09'] as const) {
            const block = fixture(id);
            if (!('rubric' in block.semantics.checking)) {
                throw new Error('Invalid fixture.');
            }

            block.semantics.checking.rubric.criteria =
                block.semantics.checking.rubric.criteria.filter(
                    (criterion) => criterion.dimension !== 'evidence',
                );

            expect(() => validateNamedExerciseActivity(block)).toThrow(
                'complete valid catalog semantics',
            );
        }
    });
});

describe('frozen source integrity at the selected-source boundary', () => {
    it('captures the declared vocabulary sense and explicit grammar target without inventing them', () => {
        expect(vocabularyExerciseSourceSense(vocabulary.entries[0]!)).toBe(
            vocabulary.entries[0]!.definition,
        );

        expect(
            vocabularyExerciseSourceSense({
                id: ids.first,
                term: 'cat',
                translation: 'chat',
            }),
        ).toBe('chat');

        expect(grammarExerciseSourceRule(grammar)).toBe(grammar.rule);
        expect(
            grammarExerciseSourceRule({
                id: ids.grammar,
                type: 'grammar',
                language: 'en',
                pattern: 'noun + adjective',
            }),
        ).toBe('noun + adjective');

        expect(() =>
            grammarExerciseSourceRule({
                id: ids.grammar,
                type: 'grammar',
                language: 'en',
                examples: [{ text: 'An example alone.' }],
            }),
        ).toThrow('explicit rule or pattern');
    });

    it('rejects changed entry terms/senses, target rules and passage wording', () => {
        const vocabularyBlock = fixture('V01');
        const lexicalSource = vocabularyBlock.semantics.sources[0]!;
        if (lexicalSource.kind !== 'vocabulary') {
            throw new Error('Invalid fixture.');
        }

        lexicalSource.entries[0]!.sense = 'Keep permanently.';
        expect(() =>
            validateNamedExerciseActivity(vocabularyBlock, sourceBlocks),
        ).toThrow('exact sense');

        const grammarBlock = fixture('G03');
        const ruleSource = grammarBlock.semantics.sources[0]!;
        if (ruleSource.kind !== 'grammar') {
            throw new Error('Invalid fixture.');
        }

        ruleSource.rule = 'Use the active voice instead.';
        expect(() =>
            validateNamedExerciseActivity(grammarBlock, sourceBlocks),
        ).toThrow('exact selected rule');

        const readingBlock = fixture('R02');
        const passageSource = readingBlock.semantics.sources[0]!;
        if (passageSource.kind !== 'text') {
            throw new Error('Invalid fixture.');
        }

        passageSource.passages[0]!.text = 'She returned it on Friday.';
        expect(() =>
            validateNamedExerciseActivity(readingBlock, sourceBlocks),
        ).toThrow('exact selected passages');
    });

    it('rejects unknown or ambiguous source identities and wrong source kinds', () => {
        const block = fixture('R01');
        expect(() =>
            validateNamedExerciseActivity(block, [text, text]),
        ).toThrow('exactly one supplied');

        expect(() =>
            validateNamedExerciseActivity(block, [{ ...grammar, id: text.id }]),
        ).toThrow('must refer to a text block');

        const source = block.semantics.sources[0]!;
        if (source.kind !== 'text') {
            throw new Error('Invalid fixture.');
        }

        source.passages[0]!.segmentId = ids.proposal;
        expect(() =>
            validateNamedExerciseActivity(block, sourceBlocks),
        ).toThrow('exact selected passages');
    });

    it('binds exact proposal block content without treating a proposal ID as authority', () => {
        const block = fixture('R01');
        const source = block.semantics.sources[0]!;
        if (source.kind !== 'text') {
            throw new Error('Invalid fixture.');
        }

        source.origin = {
            kind: 'proposal',
            proposalId: ids.proposal,
            blockId: text.id,
        };

        expect(() =>
            validateNamedExerciseActivity(block, [text]),
        ).not.toThrow();

        expect(() => validateNamedExerciseActivity(block, [])).toThrow(
            'supplied source block',
        );
    });

    it('accepts standalone frozen selections only as content and still requires named semantics', () => {
        const block = fixture('R04');
        block.semantics.sources = [
            {
                kind: 'text-selection',
                origin: { noteId: ids.text, noteVersion: 4 },
                text: text.segments[0]!.text,
            },
        ];

        expect(() => validateNamedExerciseActivity(block)).not.toThrow();
        const { semantics: _semantics, ...custom } = block;
        expect(() => validateNamedExerciseActivity(custom)).toThrow(
            NamedExerciseActivityValidationError,
        );
    });
});
