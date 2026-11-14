import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
    KnowledgeBodySchema,
    LearningBlockSchema,
    type LearningBlock,
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
            language: 'en',
            explanationLanguage: 'en',
        }),
        { blocks: sources },
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
            );
            const original = [...sources, historical, selected];
            const copied =
                operation === 'proposal-insertion'
                    ? freshProposalBlocks(original)
                    : copyWorkbookBody(insertedBody(original))
                          .document.content!.filter(
                              (node) => node.type === 'learningBlock',
                          )
                          .map((node) => node.attrs!.block!);

            for (const index of [2, 3]) {
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
