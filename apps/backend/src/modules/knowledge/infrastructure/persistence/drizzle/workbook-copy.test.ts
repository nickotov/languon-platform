import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { KnowledgeBodySchema } from '@languon/contracts';
import { copyWorkbookBody } from './workbook-copy';

describe('Workbook independent content copies', () => {
    it('preserves named activity identity while remapping answer keys and frozen source references', () => {
        const vocabularyId = randomUUID();
        const entryId = randomUUID();
        const exerciseId = randomUUID();
        const choiceIds = [randomUUID(), randomUUID()];
        const vocabulary = {
            id: vocabularyId,
            type: 'vocabulary',
            language: 'en',
            translationLanguage: 'fr',
            entries: [
                {
                    id: entryId,
                    term: 'borrow',
                    translation: 'emprunter',
                    definition: 'Use temporarily.',
                },
            ],
        };
        const exercise = {
            id: exerciseId,
            type: 'exercise',
            format: 'multiple-choice',
            question: 'Which meaning?',
            referenceAnswer: 'Use temporarily.',
            explanation: 'Borrowing is temporary.',
            choices: [
                { id: choiceIds[0], text: 'Use temporarily.' },
                { id: choiceIds[1], text: 'Keep permanently.' },
            ],
            correctChoiceId: choiceIds[0],
            semantics: {
                activity: { id: 'V02', version: 1 },
                objective: 'Recognize the source word sense.',
                language: 'en',
                explanationLanguage: 'en',
                format: 'multiple-choice',
                checking: {
                    policy: 'prepared-key',
                    key: {
                        kind: 'choice',
                        correctChoiceId: choiceIds[0],
                        explanations: [
                            {
                                choiceId: choiceIds[0],
                                explanation: 'Borrowing is temporary.',
                            },
                            {
                                choiceId: choiceIds[1],
                                explanation: 'Keeping is permanent.',
                            },
                        ],
                    },
                },
                sources: [
                    {
                        kind: 'vocabulary',
                        origin: { kind: 'block', blockId: vocabularyId },
                        entries: [
                            {
                                entryId,
                                term: 'borrow',
                                sense: 'Use temporarily.',
                            },
                        ],
                    },
                ],
            },
        };
        const body = KnowledgeBodySchema.parse({
            schemaVersion: 2,
            document: {
                type: 'doc',
                content: [vocabulary, exercise].map((block) => ({
                    type: 'learningBlock',
                    attrs: { block },
                })),
            },
        });
        const copied = copyWorkbookBody(body);
        const copiedVocabulary = copied.document.content?.[0]?.attrs?.block;
        const copiedExercise = copied.document.content?.[1]?.attrs?.block;
        if (
            copiedVocabulary?.type !== 'vocabulary' ||
            copiedExercise?.type !== 'exercise' ||
            copiedExercise.format !== 'multiple-choice'
        ) {
            throw new Error('Unexpected named fixture.');
        }

        expect(copiedExercise.semantics?.activity).toEqual({
            id: 'V02',
            version: 1,
        });

        expect(copiedExercise.semantics?.sources).toMatchObject([
            {
                kind: 'vocabulary',
                origin: { kind: 'block', blockId: copiedVocabulary.id },
                entries: [
                    {
                        entryId: copiedVocabulary.entries[0]?.id,
                        term: 'borrow',
                        sense: 'Use temporarily.',
                    },
                ],
            },
        ]);

        expect(copiedVocabulary.entries[0]?.id).not.toBe(entryId);
        expect(copiedExercise.correctChoiceId).not.toBe(choiceIds[0]);
        expect(copiedExercise.semantics?.checking).toMatchObject({
            policy: 'prepared-key',
            key: {
                kind: 'choice',
                correctChoiceId: copiedExercise.correctChoiceId,
                explanations: copiedExercise.choices.map((choice) => ({
                    choiceId: choice.id,
                })),
            },
        });

        expect(KnowledgeBodySchema.parse(copied)).toEqual(copied);
    });

    it('remaps named gap keys and retains literal UUID-shaped reference text', () => {
        const sourceId = randomUUID();
        const segmentId = randomUUID();
        const gapId = randomUUID();
        const body = KnowledgeBodySchema.parse({
            schemaVersion: 2,
            document: {
                type: 'doc',
                content: [
                    {
                        type: 'learningBlock',
                        attrs: {
                            block: {
                                id: sourceId,
                                type: 'bilingual-text',
                                language: 'en',
                                segments: [
                                    {
                                        id: segmentId,
                                        text: 'Mira borrowed a book.',
                                    },
                                ],
                                translations: [],
                            },
                        },
                    },
                    {
                        type: 'learningBlock',
                        attrs: {
                            block: {
                                id: randomUUID(),
                                type: 'exercise',
                                format: 'fill-in-the-blank',
                                question: 'Complete the summary.',
                                referenceAnswer: gapId,
                                explanation: 'A book was borrowed.',
                                parts: [
                                    {
                                        kind: 'gap',
                                        id: gapId,
                                        acceptedAnswers: ['book'],
                                    },
                                ],
                                semantics: {
                                    activity: { id: 'R08', version: 1 },
                                    objective: 'Complete a faithful summary.',
                                    language: 'en',
                                    explanationLanguage: 'en',
                                    format: 'fill-in-the-blank',
                                    checking: {
                                        policy: 'hybrid',
                                        key: {
                                            kind: 'gaps',
                                            gaps: [
                                                {
                                                    gapId,
                                                    acceptedAnswers: ['book'],
                                                    explanation:
                                                        'The borrowed object.',
                                                },
                                            ],
                                        },
                                        rubric: {
                                            criteria: [
                                                {
                                                    dimension:
                                                        'task-completion',
                                                    requirement:
                                                        'Complete the summary.',
                                                },
                                                {
                                                    dimension: 'meaning',
                                                    requirement:
                                                        'Retain the event.',
                                                },
                                                {
                                                    dimension: 'evidence',
                                                    requirement:
                                                        'Supported by the passage.',
                                                },
                                            ],
                                        },
                                    },
                                    sources: [
                                        {
                                            kind: 'text',
                                            origin: {
                                                kind: 'block',
                                                blockId: sourceId,
                                            },
                                            passages: [
                                                {
                                                    segmentId,
                                                    text: 'Mira borrowed a book.',
                                                },
                                            ],
                                        },
                                    ],
                                },
                            },
                        },
                    },
                ],
            },
        });
        const copied = copyWorkbookBody(body);
        const text = copied.document.content?.[0]?.attrs?.block;
        const exercise = copied.document.content?.[1]?.attrs?.block;
        if (
            text?.type !== 'bilingual-text' ||
            exercise?.type !== 'exercise' ||
            exercise.format !== 'fill-in-the-blank'
        ) {
            throw new Error('Unexpected named fixture.');
        }

        const gap = exercise.parts.find((part) => part.kind === 'gap');
        expect(gap?.id).not.toBe(gapId);
        expect(exercise.referenceAnswer).toBe(gapId);
        expect(exercise.semantics?.checking).toMatchObject({
            policy: 'hybrid',
            key: {
                kind: 'gaps',
                gaps: [{ gapId: gap?.id, acceptedAnswers: ['book'] }],
            },
        });

        expect(exercise.semantics?.sources).toMatchObject([
            {
                kind: 'text',
                origin: { kind: 'block', blockId: text.id },
                passages: [
                    {
                        segmentId: text.segments[0]?.id,
                        text: 'Mira borrowed a book.',
                    },
                ],
            },
        ]);
    });

    it('remaps structured identities and references without rewriting literal content', () => {
        const blockId = randomUUID();
        const segmentId = randomUUID();
        const exerciseId = randomUUID();
        const choiceId = randomUUID();
        const body = KnowledgeBodySchema.parse({
            schemaVersion: 2,
            document: {
                type: 'doc',
                content: [
                    {
                        type: 'learningBlock',
                        attrs: {
                            block: {
                                id: blockId,
                                type: 'bilingual-text',
                                language: 'es',
                                segments: [{ id: segmentId, text: blockId }],
                                translations: [],
                            },
                        },
                    },
                    {
                        type: 'learningBlock',
                        attrs: {
                            block: {
                                id: exerciseId,
                                type: 'exercise',
                                format: 'multiple-choice',
                                question: 'Which?',
                                referenceAnswer: 'First',
                                explanation: 'Reason',
                                source: { blockId, segmentIds: [segmentId] },
                                choices: [
                                    { id: choiceId, text: 'First' },
                                    { id: randomUUID(), text: 'Second' },
                                ],
                                correctChoiceId: choiceId,
                            },
                        },
                    },
                ],
            },
        });
        const copied = copyWorkbookBody(body);
        const first = copied.document.content?.[0]?.attrs?.block;
        const exercise = copied.document.content?.[1]?.attrs?.block;
        expect(first?.id).not.toBe(blockId);
        expect(exercise?.id).not.toBe(exerciseId);
        if (
            first?.type !== 'bilingual-text' ||
            exercise?.type !== 'exercise' ||
            exercise.format !== 'multiple-choice'
        ) {
            throw new Error('Unexpected fixture');
        }

        expect(first.segments[0]?.text).toBe(blockId);
        expect(exercise.source?.blockId).toBe(first.id);
        expect(exercise.source?.segmentIds).toEqual([first.segments[0]?.id]);
        expect(exercise.correctChoiceId).toBe(exercise.choices[0]?.id);
        expect(exercise.correctChoiceId).not.toBe(choiceId);
    });

    it('copies unprepared audio without fabricating an asset grant', () => {
        const blockId = randomUUID();
        const body = KnowledgeBodySchema.parse({
            schemaVersion: 2,
            document: {
                type: 'doc',
                content: [
                    {
                        type: 'learningBlock',
                        attrs: {
                            block: {
                                id: blockId,
                                type: 'audio',
                                sourceText: 'Listen later.',
                            },
                        },
                    },
                ],
            },
        });
        const copy = copyWorkbookBody(body).document.content?.[0]?.attrs?.block;
        expect(copy?.id).not.toBe(blockId);
        expect(copy).toMatchObject({
            type: 'audio',
            sourceText: 'Listen later.',
        });

        expect(copy).not.toHaveProperty('assetId');
    });

    it('copies exercise groups with one fresh shared group identity and separate question identities', () => {
        const groupId = randomUUID();
        const questionIds = [randomUUID(), randomUUID()];
        const body = KnowledgeBodySchema.parse({
            schemaVersion: 2,
            document: {
                type: 'doc',
                content: questionIds.map((id) => ({
                    type: 'learningBlock',
                    attrs: {
                        block: {
                            id,
                            type: 'exercise',
                            format: 'free-text',
                            question: 'Explain.',
                            referenceAnswer: 'A reference',
                            explanation: 'A reason',
                            hint: 'A hint',
                            group: { id: groupId, title: groupId },
                        },
                    },
                })),
            },
        });
        const copied = copyWorkbookBody(body).document.content?.map(
            (node) => node.attrs?.block,
        );
        const first = copied?.[0];
        const second = copied?.[1];
        if (first?.type !== 'exercise' || second?.type !== 'exercise') {
            throw new Error('Unexpected fixture');
        }

        expect(first.group?.id).not.toBe(groupId);
        expect(second.group?.id).toBe(first.group?.id);
        expect(first.group?.title).toBe(groupId);
        expect(first.id).not.toBe(second.id);
        expect(questionIds).not.toContain(first.id);
        expect(questionIds).not.toContain(second.id);
        expect(first.hint).toBe('A hint');
    });

    it('fails closed for audio until independent asset ownership is available', () => {
        const body = KnowledgeBodySchema.parse({
            schemaVersion: 2,
            document: {
                type: 'doc',
                content: [
                    {
                        type: 'learningBlock',
                        attrs: {
                            block: {
                                id: randomUUID(),
                                type: 'audio',
                                assetId: randomUUID(),
                            },
                        },
                    },
                ],
            },
        });

        expect(() => copyWorkbookBody(body)).toThrow(
            'independent asset ownership',
        );
    });
});
