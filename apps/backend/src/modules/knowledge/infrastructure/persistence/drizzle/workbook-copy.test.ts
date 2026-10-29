import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { KnowledgeBodySchema } from '@languon/contracts';
import { copyWorkbookBody } from './workbook-copy';

describe('Workbook independent content copies', () => {
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
        )
            throw new Error('Unexpected fixture');
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
        if (first?.type !== 'exercise' || second?.type !== 'exercise')
            throw new Error('Unexpected fixture');
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
