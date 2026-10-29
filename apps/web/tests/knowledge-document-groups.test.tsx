import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import {
    KnowledgeBodySchema,
    CopyKnowledgeBlocksRequestSchema,
    type KnowledgeBody,
    type KnowledgeNode,
    type LearningBlock,
} from '@languon/contracts';
import { knowledgeDocumentGroups } from '../src/fsd/features/knowledge-notes/lib/knowledge-document-groups';
import { KnowledgeDocumentView } from '../src/fsd/features/knowledge-notes/ui/knowledge-document-view/knowledge-document-view';
import { I18nProvider } from '../src/fsd/shared/i18n';
import { en } from '../src/fsd/shared/i18n/messages/en';

const id = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';
const third = '33333333-3333-4333-8333-333333333333';
const groupId = '44444444-4444-4444-8444-444444444444';
const segmentId = '55555555-5555-4555-8555-555555555555';
const blockNode = (block: LearningBlock): KnowledgeNode => ({
    type: 'learningBlock',
    attrs: { block },
});
const paragraph = (text = ''): KnowledgeNode => ({
    type: 'paragraph',
    content: text ? [{ type: 'text', text }] : [],
});
const exercise = (
    exerciseId: string,
): Extract<LearningBlock, { type: 'exercise' }> => ({
    id: exerciseId,
    type: 'exercise',
    format: 'free-text',
    question: `Question ${exerciseId}`,
    referenceAnswer: 'Prepared answer',
    explanation: 'Prepared reason',
    group: { id: groupId, title: 'Practice' },
});
const body = (nodes: KnowledgeNode[]): KnowledgeBody =>
    KnowledgeBodySchema.parse({
        schemaVersion: 2,
        document: { type: 'doc', content: nodes },
    });

function renderReader(
    value: KnowledgeBody,
    props: Partial<Parameters<typeof KnowledgeDocumentView>[0]> = {},
) {
    return render(
        <I18nProvider locale='en' messages={en}>
            <KnowledgeDocumentView body={value} {...props} />
        </I18nProvider>,
    );
}

describe('read-only document block composition', () => {
    it('preserves authored hard-break and whitespace-only paragraphs instead of absorbing them into a group', () => {
        const hardBreak: KnowledgeNode = {
            type: 'paragraph',
            content: [{ type: 'hardBreak' }],
        };
        const spaces: KnowledgeNode = {
            type: 'paragraph',
            content: [{ type: 'text', text: ' ' }],
        };
        for (const preserved of [hardBreak, spaces]) {
            const value = body([
                blockNode(exercise(id)),
                preserved,
                blockNode(exercise(second)),
            ]);
            const plan = knowledgeDocumentGroups(value);
            expect(plan.groups.get(id)?.map((item) => item.id)).toEqual([id]);
            expect(plan.body.document.content).toEqual(value.document.content);
        }
    });

    it('keeps stable exercise identities while folding a contiguous group across empty paragraphs', () => {
        const value = body([
            blockNode(exercise(id)),
            paragraph(),
            blockNode(exercise(second)),
            paragraph('Keep this prose'),
            blockNode(exercise(third)),
        ]);
        const plan = knowledgeDocumentGroups(value);
        expect(plan.groups.get(id)?.map((item) => item.id)).toEqual([
            id,
            second,
        ]);
        expect(plan.groups.get(third)?.map((item) => item.id)).toEqual([third]);
        expect(plan.body.document.content).toEqual([
            value.document.content![0],
            value.document.content![3],
            value.document.content![4],
        ]);
        expect(value.document.content).toHaveLength(5);
    });
    it('embeds only immediately following questions for the same media without moving meaningful prose', () => {
        const audio: LearningBlock = {
            id,
            type: 'audio',
            transcript: {
                language: 'fr',
                segments: [{ id: segmentId, text: 'Un passage' }],
            },
        };
        const firstQuestion = {
            ...exercise(second),
            source: { blockId: id, segmentIds: [segmentId] },
        };
        const laterQuestion = {
            ...exercise(third),
            source: { blockId: id, segmentIds: [segmentId] },
        };
        const value = body([
            blockNode(audio),
            paragraph(),
            blockNode(firstQuestion),
            paragraph('Read before continuing'),
            blockNode(laterQuestion),
        ]);
        const plan = knowledgeDocumentGroups(value);
        expect(plan.linked.get(id)?.map((item) => item.id)).toEqual([second]);
        expect(plan.body.document.content).toEqual([
            value.document.content![0],
            value.document.content![3],
            value.document.content![4],
        ]);
        renderReader(value);
        expect(screen.getByText('Read before continuing')).toBeVisible();
        expect(
            screen.getByRole('button', {
                name: new RegExp(firstQuestion.question),
            }),
        ).toBeVisible();
        expect(
            screen.getByRole('button', {
                name: new RegExp(laterQuestion.question),
            }),
        ).toBeVisible();
        expect(screen.queryByText('Prepared answer')).not.toBeInTheDocument();
    });
    it('uses presentation-only media membership without pretending a question has transcript grounding', () => {
        const question = {
            ...exercise(second),
            group: { id: groupId, title: 'Practice', parentBlockId: id },
        };
        const plan = knowledgeDocumentGroups(
            body([
                blockNode({ id, type: 'audio' }),
                paragraph(),
                blockNode(question),
            ]),
        );
        expect(plan.linked.get(id)).toEqual([question]);
        expect(plan.linked.get(id)?.[0]?.source).toBeUndefined();
    });
    it('uses reader settings for library/copy/custom actions without exposing author controls or outer button rows', async () => {
        const practice = vi.fn();
        const request = vi.fn();
        renderReader(
            body([
                blockNode({
                    id,
                    type: 'vocabulary',
                    language: 'fr',
                    translationLanguage: 'ru',
                    title: 'Words',
                    entries: [
                        { id: second, term: 'travail', translation: 'работа' },
                    ],
                }),
            ]),
            {
                blockCopy: {
                    requestWithSession: request,
                    source: CopyKnowledgeBlocksRequestSchema.shape.source.parse(
                        { kind: 'saved', noteId: id, expectedVersion: 1 },
                    ),
                },
                getBlockActions: () => [
                    { label: 'Train words', onSelect: practice },
                ],
                blockOptions: () => ({
                    headingActions: (
                        <button type='button'>Existing host action</button>
                    ),
                }),
            },
        );
        expect(
            screen.getByRole('button', { name: 'Existing host action' }),
        ).toBeVisible();
        expect(
            screen.queryByRole('button', { name: 'Copy blocks to a note' }),
        ).not.toBeInTheDocument();
        fireEvent.click(
            screen.getByRole('button', { name: 'Block settings: Words' }),
        );
        expect(
            await screen.findByRole('menuitem', { name: 'Copy block' }),
        ).toBeVisible();
        expect(
            screen.queryByRole('menuitem', { name: 'Edit' }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('menuitem', { name: 'Delete' }),
        ).not.toBeInTheDocument();
        fireEvent.click(screen.getByRole('menuitem', { name: 'Train words' }));
        expect(practice).toHaveBeenCalledTimes(1);
        expect(request).not.toHaveBeenCalled();
    });
});
