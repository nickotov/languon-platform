import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
    KnowledgeBodySchema,
    LearningBlockSchema,
    type LearningBlock,
    type LessonPart,
    type ExerciseActivityId,
} from '@languon/contracts';
import {
    blockContentHash,
    findProposalBlock,
    freshProposalBlocks,
    replaceProposalBlock,
} from './block-proposal-content';
import { completeNamedExerciseSources } from '../../ai/exercise-authoring-context';
import { namedExerciseFixture } from '../../../../../../tests/support/named-exercise-fixture';
import { lessonPartsInDocument } from './lesson-proposal-parts';
import { lessonCopyNodes } from './lesson-copy-nodes';
import { copyWorkbookBody } from '../../../../knowledge/infrastructure/persistence/drizzle/workbook-copy';

const block: LearningBlock = {
    id: randomUUID(),
    type: 'grammar',
    language: 'fr',
    rule: 'Use faire.',
};

function namedSourceBlocks(): LearningBlock[] {
    return LearningBlockSchema.array().parse([
        {
            id: randomUUID(),
            type: 'vocabulary',
            language: 'en',
            translationLanguage: 'fr',
            entries: [
                {
                    id: randomUUID(),
                    term: 'borrow',
                    translation: 'emprunter',
                    definition: 'Use temporarily and give back.',
                },
            ],
        },
        {
            id: randomUUID(),
            type: 'bilingual-text',
            language: 'en',
            segments: [
                {
                    id: randomUUID(),
                    text: 'Mira borrowed a book and returned it on Monday.',
                },
            ],
            translations: [],
        },
    ]);
}

function canonicalNamedExercise(
    activityId: ExerciseActivityId,
    sources: LearningBlock[],
) {
    return completeNamedExerciseSources(
        namedExerciseFixture({
            activityId,
            sources,
        }),
        { blocks: sources },
        { language: 'en', explanationLanguage: 'en' },
    );
}

function insertedBody(blocks: LearningBlock[]) {
    return KnowledgeBodySchema.parse({
        schemaVersion: 2,
        document: {
            type: 'doc',
            content: [
                {
                    type: 'paragraph',
                    content: [
                        { type: 'text', text: 'Surrounding draft prose.' },
                    ],
                },
                ...blocks.map((block) => ({
                    type: 'learningBlock',
                    attrs: { block },
                })),
            ],
        },
    });
}

describe('Block proposal content identity', () => {
    it('freshens actual inserted V01, V07 and R03 proposal content without replacing named activity IDs', () => {
        const sources = namedSourceBlocks();
        const generated = (['V01', 'V07', 'R03'] as const).map((activityId) =>
            canonicalNamedExercise(activityId, sources),
        );
        const original = [...sources, ...generated];
        const inserted = freshProposalBlocks(original);
        const canonical = insertedBody(inserted);
        expect(canonical.document.content?.[0]).toEqual({
            type: 'paragraph',
            content: [{ type: 'text', text: 'Surrounding draft prose.' }],
        });

        expect(
            canonical.document.content
                ?.filter((node) => node.type === 'learningBlock')
                .map((node) => node.attrs!.block),
        ).toEqual(inserted);

        expect(
            inserted
                .map((item) => item.id)
                .some((id) => original.some((item) => item.id === id)),
        ).toBe(false);

        const vocabulary = inserted[0];
        const text = inserted[1];
        if (
            vocabulary?.type !== 'vocabulary' ||
            text?.type !== 'bilingual-text'
        ) {
            throw new Error('Unexpected inserted source fixture.');
        }

        for (const [index, activityId] of (
            ['V01', 'V07', 'R03'] as const
        ).entries()) {
            const exercise = inserted[index + 2];
            if (exercise?.type !== 'exercise') {
                throw new Error('Unexpected inserted exercise fixture.');
            }

            expect(exercise.semantics?.activity).toEqual({
                id: activityId,
                version: 1,
            });

            if (
                activityId === 'R03' &&
                exercise.format === 'multiple-choice' &&
                exercise.semantics?.checking.policy === 'prepared-key' &&
                exercise.semantics.checking.key.kind === 'choice'
            ) {
                const key = exercise.semantics.checking.key;
                expect(key.correctChoiceId).toBe(exercise.correctChoiceId);
                expect(key.explanations.map((item) => item.choiceId)).toEqual(
                    exercise.choices.map((item) => item.id),
                );

                expect(
                    key.classification?.roles.map((item) => item.choiceId),
                ).toEqual(exercise.choices.map((item) => item.id));

                expect(exercise.semantics.sources).toMatchObject([
                    {
                        kind: 'text',
                        origin: { kind: 'block', blockId: text.id },
                        passages: [{ segmentId: text.segments[0]?.id }],
                    },
                ]);
            } else {
                expect(exercise.semantics?.sources).toMatchObject([
                    {
                        kind: 'vocabulary',
                        origin: { kind: 'block', blockId: vocabulary.id },
                        entries: [{ entryId: vocabulary.entries[0]?.id }],
                    },
                ]);
            }
        }
    });

    it('inserts whole tasks, including needed sources once, using the live draft to guard against duplicate parts', () => {
        const sources = namedSourceBlocks();
        const source = sources[1]!;
        const exercise = canonicalNamedExercise('R03', sources);
        const body = insertedBody([source, exercise]);
        body.document.content!.unshift({
            type: 'heading',
            attrs: { level: 2 },
            content: [{ type: 'text', text: 'Lecture' }],
        });

        const proposal = { id: randomUUID(), body, dependencySnapshots: [] };
        const layout: LessonPart[] = [
            {
                taskId: 'reading',
                kind: 'prose',
                startIndex: 0,
                nodeCount: 2,
                present: false,
            },
            {
                taskId: 'passage',
                kind: 'bilingual-text',
                startIndex: 2,
                nodeCount: 1,
                present: false,
            },
            {
                taskId: 'practice',
                kind: 'exercises',
                startIndex: 3,
                nodeCount: 1,
                present: false,
            },
        ];
        const draft: typeof body.document = { type: 'doc', content: [] };
        const insert = (taskId?: string) =>
            lessonCopyNodes(
                proposal,
                lessonPartsInDocument(proposal, layout, draft),
                draft,
                taskId,
            );

        expect(insert('reading').map((n) => n.type)).toEqual([
            'heading',
            'paragraph',
        ]);

        draft.content!.push(...insert('practice'));
        expect(draft.content!.map((n) => n.attrs?.lessonBlockId)).toEqual([
            source.id,
            exercise.id,
        ]);

        expect(insert('passage')).toEqual([]);
        expect(insert('practice')).toEqual([]);
        draft.content!.push(...insert());
        expect(insert()).toEqual([]);
        expect(
            KnowledgeBodySchema.safeParse({ schemaVersion: 2, document: draft })
                .success,
        ).toBe(true);

        draft.content!.splice(2, 1);
        expect(insert('reading')).toEqual([]);
        draft.content!.splice(2, 1);
        expect(insert('reading')).toHaveLength(2);
        const oldExercise = draft.content!.pop()!.attrs!.block!;
        const practiceAgain = insert('practice');
        expect(practiceAgain).toHaveLength(1);
        expect(practiceAgain[0]!.attrs?.block?.id).not.toBe(oldExercise.id);
        const originalCopy = draft.content![0]!.attrs!.block!;
        if (originalCopy.type !== 'bilingual-text') {
            throw new Error('Expected the source passage.');
        }

        originalCopy.segments[0]!.text = 'Rewritten in the draft.';
        const restored = insert('practice');
        expect(restored).toHaveLength(2);
        expect(restored[0]!.attrs?.block?.id).not.toBe(originalCopy.id);
        expect(restored[1]!.attrs?.block).toMatchObject({
            semantics: {
                sources: [
                    { origin: { blockId: restored[0]!.attrs?.block?.id } },
                ],
            },
        });

        expect(
            KnowledgeBodySchema.safeParse({
                schemaVersion: 2,
                document: {
                    type: 'doc',
                    content: [...draft.content!, ...restored],
                },
            }).success,
        ).toBe(true);

        expect(() => insert('unknown')).toThrow();
    });

    it('remaps every named gap key when inserting canonical generated source and exercise content', () => {
        const sources = namedSourceBlocks();
        const original = canonicalNamedExercise('V03', sources);
        const inserted = freshProposalBlocks([...sources, original]);
        const exercise = inserted[2];
        if (
            exercise?.type !== 'exercise' ||
            exercise.format !== 'fill-in-the-blank' ||
            exercise.semantics?.checking.policy !== 'hybrid' ||
            exercise.semantics.checking.key.kind !== 'gaps'
        ) {
            throw new Error('Unexpected inserted gap fixture.');
        }

        expect(
            exercise.semantics.checking.key.gaps.map((item) => item.gapId),
        ).toEqual(
            exercise.parts
                .filter((item) => item.kind === 'gap')
                .map((item) => item.id),
        );

        expect(insertedBody(inserted)).toBeDefined();
    });

    it.each(['proposal-insertion', 'workbook-copy'] as const)(
        'preserves historical proposal and selection origins despite structural UUID collisions during %s',
        (operation) => {
            const sources = namedSourceBlocks();
            const historical = completeNamedExerciseSources(
                namedExerciseFixture({ activityId: 'V01', sources }),
                { blocks: sources, proposalId: sources[0]!.id },
                { language: 'en', explanationLanguage: 'en' },
            );
            const wire = namedExerciseFixture({ activityId: 'R03', sources });
            const selected = completeNamedExerciseSources(
                { ...wire, sourceBindings: [{ kind: 'text-selection' }] },
                {
                    blocks: [],
                    selection: {
                        noteId: sources[0]!.id,
                        noteVersion: 1,
                        text: 'Mira borrowed a book and returned it on Monday.',
                    },
                },
                { language: 'en', explanationLanguage: 'en' },
            );
            const captured = completeNamedExerciseSources(
                namedExerciseFixture({ activityId: 'V01', sources }),
                {
                    blocks: sources,
                    capturedOrigins: new Map([
                        [
                            sources[0]!.id,
                            {
                                kind: 'captured-block',
                                runId: sources[0]!.id,
                                revision: 1,
                                sourceId: 'captured-vocabulary',
                                blockId: sources[0]!.id,
                                contentHash: 'a'.repeat(64),
                            },
                        ],
                    ]),
                },
                { language: 'en', explanationLanguage: 'en' },
            );
            const original = [...sources, historical, selected, captured];
            const copied =
                operation === 'proposal-insertion'
                    ? freshProposalBlocks(original)
                    : copyWorkbookBody(insertedBody(original))
                          .document.content!.filter(
                              (node) => node.type === 'learningBlock',
                          )
                          .map((node) => node.attrs!.block!);

            for (const index of [2, 3, 4]) {
                const before = original[index];
                const after = copied[index];
                if (before?.type !== 'exercise' || after?.type !== 'exercise') {
                    throw new Error('Unexpected historical source fixture.');
                }

                expect(after.id).not.toBe(before.id);
                expect(after.semantics?.sources).toEqual(
                    before.semantics?.sources,
                );

                expect(after.semantics?.activity).toEqual(
                    before.semantics?.activity,
                );
            }

            expect(insertedBody(copied)).toBeDefined();
        },
    );

    it('ignores JSONB property ordering but detects content changes', () => {
        const reordered = Object.fromEntries(
            Object.entries(block).reverse(),
        ) as LearningBlock;

        expect(blockContentHash(block)).toBe(blockContentHash(reordered));
        expect(blockContentHash(block)).not.toBe(
            blockContentHash({ ...block, title: 'Different' }),
        );
    });

    it('replaces only the target while preserving surrounding prose and other blocks', () => {
        const other = { ...block, id: randomUUID() };
        const paragraph = {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Keep this.' }],
        };
        const document = {
            type: 'doc',
            content: [
                paragraph,
                { type: 'learningBlock', attrs: { block } },
                { type: 'learningBlock', attrs: { block: other } },
            ],
        };
        const replacement = { ...block, title: 'Updated' };
        const changed = replaceProposalBlock(document, block.id, replacement);
        expect(findProposalBlock(changed, block.id)).toEqual(replacement);
        expect(findProposalBlock(changed, other.id)).toEqual(other);
        expect((changed as typeof document).content[0]).toEqual(paragraph);
        expect(findProposalBlock(document, block.id)).toEqual(block);
    });

    it('freshens copied exercise identities and shared group identity exactly once', () => {
        const group = { id: randomUUID(), title: 'Questions' };
        const items: LearningBlock[] = [1, 2].map((n) => ({
            id: randomUUID(),
            type: 'exercise',
            format: 'free-text',
            question: `Q${n}`,
            referenceAnswer: 'A',
            explanation: 'Why',
            group,
        }));
        const copies = freshProposalBlocks(items);
        expect(copies[0]?.id).not.toBe(items[0]?.id);
        expect(copies[1]?.id).not.toBe(items[1]?.id);
        const a = copies[0];
        const b = copies[1];
        if (a?.type !== 'exercise' || b?.type !== 'exercise') {
            throw new Error('Expected exercises');
        }

        expect(a.group?.id).toBe(b.group?.id);
        expect(a.group?.id).not.toBe(group.id);
    });
});
