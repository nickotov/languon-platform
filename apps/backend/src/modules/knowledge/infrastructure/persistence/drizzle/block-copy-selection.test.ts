import { describe, expect, it } from 'vitest';
import { KnowledgeBodySchema } from '@languon/contracts';
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

describe('media-associated independent block selection', () => {
    it('includes inline questions with requested media and freshens parent identity consistently', () => {
        const selected = selectKnowledgeBlocksForCopy(body(), [mediaId]);
        expect(selected.document.content).toHaveLength(2);
        const copied = copyWorkbookBody(selected).document.content!;
        const copiedMedia = copied[0]!.attrs!.block!;
        const copiedQuestion = copied[1]!.attrs!.block!;
        if (copiedQuestion.type !== 'exercise') throw new Error('fixture');
        expect(copiedQuestion.group?.parentBlockId).toBe(copiedMedia.id);
        expect(copiedMedia.id).not.toBe(mediaId);
        expect(copiedQuestion.group?.id).not.toBe(groupId);
    });
    it('detaches only presentation parent when copying an ungrounded question alone', () => {
        const selected = selectKnowledgeBlocksForCopy(body(), [questionId]);
        expect(selected.document.content).toHaveLength(1);
        const copied = selected.document.content![0]!.attrs!.block!;
        if (copied.type !== 'exercise') throw new Error('fixture');
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
