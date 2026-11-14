import { describe, expect, it } from 'vitest';
import {
    KnowledgeBodySchema,
    LearningBlockSchema,
    type LearningBlock,
    type ExerciseLearningBlock,
    type KnowledgeBody,
} from '@languon/contracts';
import { selectKnowledgeBlocksForCopy } from './block-copy-selection';
import { copyWorkbookBody } from './workbook-copy';

const mediaId = '00000000-0000-4000-8000-000000000001';
const questionId = '00000000-0000-4000-8000-000000000002';
const groupId = '00000000-0000-4000-8000-000000000003';
const node = (block: unknown) => ({ type: 'learningBlock', attrs: { block } });
const media = { id: mediaId, type: 'audio' };
const question = {
    id: questionId,
    type: 'exercise',
    format: 'free-text',
    question: 'What happened?',
    referenceAnswer: 'An example answer.',
    explanation: 'Why.',
    group: { id: groupId, title: 'Questions', parentBlockId: mediaId },
};
const body = () =>
    KnowledgeBodySchema.parse({
        schemaVersion: 2,
        document: { type: 'doc', content: [node(media), node(question)] },
    });

function namedFixture(kind: 'vocabulary' | 'grammar' | 'text') {
    const origin = { kind: 'block' as const, blockId: mediaId };
    let source: LearningBlock;
    let snapshot;
    if (kind === 'vocabulary') {
        source = LearningBlockSchema.parse({
            id: mediaId,
            type: 'vocabulary',
            language: 'en',
            translationLanguage: 'fr',
            entries: [
                {
                    id: groupId,
                    term: 'borrow',
                    translation: 'emprunter',
                    definition: 'Use temporarily.',
                },
            ],
        });

        snapshot = {
            kind,
            origin,
            entries: [
                { entryId: groupId, term: 'borrow', sense: 'Use temporarily.' },
            ],
        };
    } else if (kind === 'grammar') {
        source = LearningBlockSchema.parse({
            id: mediaId,
            type: 'grammar',
            language: 'en',
            rule: 'Use the past tense.',
        });

        snapshot = { kind, origin, rule: 'Use the past tense.' };
    } else {
        source = LearningBlockSchema.parse({
            id: mediaId,
            type: 'bilingual-text',
            language: 'en',
            segments: [{ id: groupId, text: 'Mira borrowed a book.' }],
            translations: [],
        });

        snapshot = {
            kind,
            origin,
            passages: [{ segmentId: groupId, text: 'Mira borrowed a book.' }],
        };
    }

    const criteria = [
        { dimension: 'task-completion', requirement: 'Complete the task.' },
        { dimension: 'meaning', requirement: 'Keep the meaning.' },
        {
            dimension: kind === 'text' ? 'evidence' : 'target-use',
            requirement: 'Use the source accurately.',
        },
    ];
    const exercise = LearningBlockSchema.parse({
        id: questionId,
        type: 'exercise',
        format: 'free-text',
        question: 'Explain the source.',
        referenceAnswer: 'An example.',
        explanation: 'A reason.',
        ...(kind !== 'text' ? { acceptedAnswers: ['A valid answer.'] } : {}),
        semantics: {
            activity: {
                id:
                    kind === 'vocabulary'
                        ? 'V01'
                        : kind === 'grammar'
                          ? 'G03'
                          : 'R04',
                version: 1,
            },
            objective: 'Practise selected material.',
            language: 'en',
            explanationLanguage: 'en',
            format: 'free-text',
            checking:
                kind === 'text'
                    ? { policy: 'ai-rubric', rubric: { criteria } }
                    : {
                          policy: 'hybrid',
                          key: {
                              kind: 'text',
                              acceptedAnswers: ['A valid answer.'],
                          },
                          rubric: { criteria },
                      },
            sources: [snapshot],
        },
    }) as ExerciseLearningBlock;

    return { source, exercise };
}

function namedBody(blocks: LearningBlock[]) {
    return KnowledgeBodySchema.parse({
        schemaVersion: 2,
        document: { type: 'doc', content: blocks.map(node) },
    });
}

// Copy selection also fences stale persisted snapshots, before the final canonical parse.
function staleNamedBody(blocks: LearningBlock[]): KnowledgeBody {
    return {
        schemaVersion: 2,
        document: {
            type: 'doc',
            content: blocks.map((block) => ({
                type: 'learningBlock',
                attrs: { block },
            })),
        },
    };
}

describe('media-associated independent block selection', () => {
    it('includes inline questions with requested media and freshens parent identity consistently', () => {
        const selected = selectKnowledgeBlocksForCopy(body(), [mediaId]);
        expect(selected.document.content).toHaveLength(2);
        const copied = copyWorkbookBody(selected).document.content!;
        const copiedMedia = copied[0]!.attrs!.block!;
        const copiedQuestion = copied[1]!.attrs!.block!;
        if (copiedQuestion.type !== 'exercise') {
            throw new Error('fixture');
        }

        expect(copiedQuestion.group?.parentBlockId).toBe(copiedMedia.id);
        expect(copiedMedia.id).not.toBe(mediaId);
        expect(copiedQuestion.group?.id).not.toBe(groupId);
    });

    it('detaches only presentation parent when copying an ungrounded question alone', () => {
        const selected = selectKnowledgeBlocksForCopy(body(), [questionId]);
        expect(selected.document.content).toHaveLength(1);
        const copied = selected.document.content![0]!.attrs!.block!;
        if (copied.type !== 'exercise') {
            throw new Error('fixture');
        }

        expect(copied.group).toEqual({ id: groupId, title: 'Questions' });
        expect(copied.source).toBeUndefined();
    });

    it('rejects missing, self-referential and nonmedia presentation parents', () => {
        for (const parentBlockId of [questionId, groupId]) {
            expect(
                KnowledgeBodySchema.safeParse({
                    schemaVersion: 2,
                    document: {
                        type: 'doc',
                        content: [
                            node(media),
                            node({
                                ...question,
                                group: { ...question.group, parentBlockId },
                            }),
                        ],
                    },
                }).success,
            ).toBe(false);
        }

        expect(
            KnowledgeBodySchema.safeParse({
                schemaVersion: 2,
                document: {
                    type: 'doc',
                    content: [
                        node({
                            id: mediaId,
                            type: 'grammar',
                            language: 'en',
                            rule: 'A rule',
                        }),
                        node(question),
                    ],
                },
            }).success,
        ).toBe(false);
    });
});

describe('named exercise source selection for independent copies', () => {
    it.each(['vocabulary', 'grammar', 'text'] as const)(
        'includes exactly the named exercise and its local %s source',
        (kind) => {
            const { source, exercise } = namedFixture(kind);
            const unrelated = LearningBlockSchema.parse({
                id: '00000000-0000-4000-8000-000000000004',
                type: 'grammar',
                language: 'en',
                rule: 'An unrelated rule.',
            });
            const selected = selectKnowledgeBlocksForCopy(
                namedBody([source, exercise, unrelated]),
                [exercise.id],
            );

            expect(
                selected.document.content?.map((item) => item.attrs?.block?.id),
            ).toEqual([source.id, exercise.id]);

            const copied = copyWorkbookBody(selected).document.content!.map(
                (item) => item.attrs!.block!,
            );

            expect(copied[0]?.id).not.toBe(source.id);
            expect(copied[1]).toMatchObject({
                semantics: {
                    activity: exercise.semantics!.activity,
                    sources: [
                        { origin: { kind: 'block', blockId: copied[0]?.id } },
                    ],
                },
            });
        },
    );

    it('refuses a removed local source instead of copying a dangling provenance reference', () => {
        const { exercise } = namedFixture('vocabulary');
        expect(() =>
            selectKnowledgeBlocksForCopy(staleNamedBody([exercise]), [
                exercise.id,
            ]),
        ).toThrow('named exercise source changed');
    });

    it('refuses a local source whose material kind no longer matches the named provenance', () => {
        const { exercise } = namedFixture('vocabulary');
        const wrongSource = LearningBlockSchema.parse({
            id: mediaId,
            type: 'grammar',
            language: 'en',
            rule: 'A grammar source is not vocabulary.',
        });

        expect(() =>
            selectKnowledgeBlocksForCopy(
                staleNamedBody([wrongSource, exercise]),
                [exercise.id],
            ),
        ).toThrow();
    });

    it.each(['vocabulary', 'text'] as const)(
        'refuses removed referenced %s item identities in the local source',
        (kind) => {
            const { source, exercise } = namedFixture(kind);
            const missingId = '00000000-0000-4000-8000-000000000005';
            const changed =
                source.type === 'vocabulary'
                    ? {
                          ...source,
                          entries: source.entries.map((entry) => ({
                              ...entry,
                              id: missingId,
                          })),
                      }
                    : source.type === 'bilingual-text'
                      ? {
                            ...source,
                            segments: source.segments.map((segment) => ({
                                ...segment,
                                id: missingId,
                            })),
                        }
                      : source;

            expect(() =>
                selectKnowledgeBlocksForCopy(
                    staleNamedBody([changed, exercise]),
                    [exercise.id],
                ),
            ).toThrow();
        },
    );

    it('copies a frozen proposal snapshot without inventing a live dependency on its historical block', () => {
        const { exercise } = namedFixture('vocabulary');
        const source = exercise.semantics!.sources[0]!;
        if (source.kind === 'text-selection') {
            throw new Error('Unexpected block source fixture.');
        }

        const frozen = {
            ...exercise,
            semantics: {
                ...exercise.semantics!,
                sources: [
                    {
                        ...source,
                        origin: {
                            kind: 'proposal' as const,
                            proposalId: groupId,
                            blockId: mediaId,
                        },
                    },
                ],
            },
        };
        const selected = selectKnowledgeBlocksForCopy(namedBody([frozen]), [
            exercise.id,
        ]);

        expect(selected.document.content).toHaveLength(1);
        expect(
            copyWorkbookBody(selected).document.content?.[0]?.attrs?.block,
        ).toMatchObject({
            semantics: {
                activity: exercise.semantics!.activity,
                sources: frozen.semantics.sources,
            },
        });
    });

    it('copies an authorized frozen text selection without pulling an unrelated local block', () => {
        const { exercise } = namedFixture('text');
        const snapshot = {
            kind: 'text-selection' as const,
            origin: { noteId: mediaId, noteVersion: 3 },
            text: 'Mira borrowed a book.',
        };
        const frozen = {
            ...exercise,
            semantics: { ...exercise.semantics!, sources: [snapshot] },
        };
        const selected = selectKnowledgeBlocksForCopy(namedBody([frozen]), [
            exercise.id,
        ]);

        expect(selected.document.content).toHaveLength(1);
        expect(
            copyWorkbookBody(selected).document.content?.[0]?.attrs?.block,
        ).toMatchObject({ semantics: { sources: [snapshot] } });
    });
});
