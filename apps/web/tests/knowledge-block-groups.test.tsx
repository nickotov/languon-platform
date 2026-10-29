import { createRef } from 'react';
import type { Editor } from '@tiptap/core';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KnowledgeBodySchema } from '@languon/contracts';
import {
    KnowledgeEditor,
    type KnowledgeEditorHandle,
} from '../src/fsd/features/knowledge-notes';
import { render } from './render';
const groupId = '55555555-5555-4555-8555-555555555555';
const question1 = {
    id: '11111111-1111-4111-8111-111111111111',
    type: 'exercise',
    format: 'free-text',
    question: 'First question?',
    referenceAnswer: 'First answer.',
    explanation: 'First reason.',
    group: { id: groupId, title: 'Practice set' },
};
const question2 = {
    ...question1,
    id: '22222222-2222-4222-8222-222222222222',
    question: 'Second question?',
    referenceAnswer: 'Second answer.',
};
const grammar = {
    id: '33333333-3333-4333-8333-333333333333',
    type: 'grammar',
    language: 'en',
    title: 'Next rule',
    rule: 'A later rule.',
};
const body = KnowledgeBodySchema.parse({
    schemaVersion: 2,
    document: {
        type: 'doc',
        content: [
            { type: 'learningBlock', attrs: { block: question1 } },
            { type: 'learningBlock', attrs: { block: question2 } },
            { type: 'learningBlock', attrs: { block: grammar } },
        ],
    },
});

it('counts inline author practice without changing the authored document', async () => {
    const value = KnowledgeBodySchema.parse({
        schemaVersion: 2,
        document: {
            type: 'doc',
            content: [question1, question2].map((question) => ({
                type: 'learningBlock',
                attrs: {
                    block: {
                        ...question,
                        format: 'multiple-choice',
                        choices: [
                            { id: grammar.id, text: 'Prepared choice' },
                            { id: groupId, text: 'Other choice' },
                        ],
                        correctChoiceId: grammar.id,
                    },
                },
            })),
        },
    });
    const change = vi.fn();
    render(<KnowledgeEditor value={value} onChange={change} />);
    expect(await screen.findByText('0 / 2 attempted')).toBeVisible();
    expect(screen.getByText('Exercise · 2')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Expand all' }));
    fireEvent.click(screen.getAllByLabelText('Prepared choice')[0]!);
    fireEvent.click(screen.getAllByRole('button', { name: 'Show answer' })[0]!);
    expect(screen.getByText('0 / 2 attempted')).toBeVisible();
    fireEvent.click(
        screen.getAllByRole('button', { name: 'Check', exact: true })[0]!,
    );
    expect(screen.getByText('1 / 2 attempted')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Collapse all' }));
    fireEvent.click(screen.getByRole('button', { name: 'Expand all' }));
    expect(screen.getAllByLabelText('Prepared choice')[0]).toBeChecked();
    fireEvent.click(screen.getAllByRole('button', { name: 'Try again' })[0]!);
    expect(screen.getByText('0 / 2 attempted')).toBeVisible();
    expect(change).not.toHaveBeenCalled();
});

describe('exercise set authoring', () => {
    it('edits a grouped set atomically while preserving question and group identities', async () => {
        const change = vi.fn();
        const editor = createRef<KnowledgeEditorHandle>();
        render(<KnowledgeEditor ref={editor} value={body} onChange={change} />);
        await waitFor(() => expect(editor.current).not.toBeNull());
        expect(
            screen.getAllByRole('button', { name: /^Block settings:/ }),
        ).toHaveLength(2);
        fireEvent.click(
            await screen.findByRole('button', {
                name: 'Block settings: Practice set',
            }),
        );
        fireEvent.click(
            await screen.findByRole('menuitem', { name: 'Edit', exact: true }),
        );
        fireEvent.change(screen.getByLabelText('Title'), {
            target: { value: 'Updated set' },
        });
        fireEvent.change(screen.getAllByLabelText('Question')[0]!, {
            target: { value: 'Updated first question?' },
        });
        expect(change).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));
        await waitFor(() => expect(change).toHaveBeenCalledOnce());
        const content = change.mock.lastCall![0].document.content;
        expect(content[0].attrs.block).toMatchObject({
            id: question1.id,
            question: 'Updated first question?',
            group: { id: groupId, title: 'Updated set' },
        });
        expect(content[1].attrs.block).toMatchObject({
            id: question2.id,
            group: { id: groupId, title: 'Updated set' },
        });
        fireEvent.click(
            screen.getByRole('button', { name: 'Undo', exact: true }),
        );
        expect(editor.current?.getSnapshot().content).toContain(
            'First question?',
        );
    });
    it('moves and duplicates the complete question set rather than its first item', async () => {
        const change = vi.fn();
        const editor = createRef<KnowledgeEditorHandle>();
        render(<KnowledgeEditor ref={editor} value={body} onChange={change} />);
        await waitFor(() => expect(editor.current).not.toBeNull());
        fireEvent.click(
            await screen.findByRole('button', {
                name: 'Block settings: Practice set',
            }),
        );
        fireEvent.click(
            await screen.findByRole('menuitem', {
                name: 'Move down',
                exact: true,
            }),
        );
        let nodes = change.mock.lastCall![0].document.content.filter(
            (node: { type: string }) => node.type === 'learningBlock',
        );
        expect(
            nodes.map(
                (node: { attrs: { block: { id: string } } }) =>
                    node.attrs.block.id,
            ),
        ).toEqual([grammar.id, question1.id, question2.id]);
        fireEvent.click(
            await screen.findByRole('button', {
                name: 'Block settings: Practice set',
            }),
        );
        fireEvent.click(
            await screen.findByRole('menuitem', {
                name: 'Duplicate',
                exact: true,
            }),
        );
        nodes = change.mock.lastCall![0].document.content.filter(
            (node: { type: string }) => node.type === 'learningBlock',
        );
        expect(nodes).toHaveLength(5);
        expect(nodes[3].attrs.block.group.id).toBe(
            nodes[4].attrs.block.group.id,
        );
        expect(nodes[3].attrs.block.group.id).not.toBe(groupId);
    });
    it('offers writable prose between sets without mutating content just by rendering or selecting', async () => {
        const change = vi.fn();
        const editor = createRef<KnowledgeEditorHandle>();
        render(<KnowledgeEditor ref={editor} value={body} onChange={change} />);
        await waitFor(() => expect(editor.current).not.toBeNull());
        expect(change).not.toHaveBeenCalled();
        const gaps = screen.getAllByRole('button', { name: 'Write here…' });
        expect(gaps).toHaveLength(2);
        fireEvent.click(gaps[0]!);
        await waitFor(() => expect(change).toHaveBeenCalledOnce());
        const content = change.mock.lastCall![0].document.content;
        expect(content[2]).toMatchObject({ type: 'paragraph' });
        expect(content[0].attrs.block.id).toBe(question1.id);
        expect(content[1].attrs.block.id).toBe(question2.id);
        act(() => {
            editor.current?.applyProposal('Some text', 'insert');
        });
    });
});

it('edits audio and its ungrounded associated questions in one explicit draft transaction', async () => {
    const audioId = '77777777-7777-4777-8777-777777777777';
    const audio = {
        id: audioId,
        type: 'audio',
        title: 'Listening',
        sourceText: 'A short dialogue.',
    };
    const question = {
        ...question1,
        group: { id: groupId, parentBlockId: audioId, title: 'Questions' },
    };
    const initial = KnowledgeBodySchema.parse({
        schemaVersion: 2,
        document: {
            type: 'doc',
            content: [
                { type: 'learningBlock', attrs: { block: audio } },
                { type: 'learningBlock', attrs: { block: question } },
            ],
        },
    });
    const change = vi.fn();
    const editor = createRef<KnowledgeEditorHandle>();
    render(<KnowledgeEditor ref={editor} value={initial} onChange={change} />);
    await waitFor(() => expect(editor.current).not.toBeNull());
    expect(
        screen.getAllByRole('button', { name: /^Block settings:/ }),
    ).toHaveLength(1);
    fireEvent.click(
        screen.getByRole('button', { name: 'Block settings: Listening' }),
    );
    fireEvent.click(
        await screen.findByRole('menuitem', { name: 'Edit', exact: true }),
    );
    fireEvent.change(screen.getByLabelText('Speech source text'), {
        target: { value: 'Updated dialogue.' },
    });
    fireEvent.change(screen.getByLabelText('Question'), {
        target: { value: 'Updated audio question?' },
    });
    expect(change).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));
    await waitFor(() => expect(change).toHaveBeenCalledOnce());
    const content = change.mock.lastCall![0].document.content;
    expect(content[0].attrs.block).toMatchObject({
        id: audioId,
        sourceText: 'Updated dialogue.',
    });
    expect(content[1].attrs.block).toMatchObject({
        id: question1.id,
        question: 'Updated audio question?',
        group: { id: groupId, parentBlockId: audioId },
    });
    expect(content[1].attrs.block.source).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Undo', exact: true }));
    expect(editor.current?.getSnapshot().content).toContain(
        'A short dialogue.',
    );
});

it('joins only empty paragraph gaps and provides one writable line after a logical set', async () => {
    const groupedBody = KnowledgeBodySchema.parse({
        schemaVersion: 2,
        document: {
            type: 'doc',
            content: [
                { type: 'learningBlock', attrs: { block: question1 } },
                { type: 'paragraph' },
                { type: 'learningBlock', attrs: { block: question2 } },
            ],
        },
    });
    const change = vi.fn();
    const editor = createRef<KnowledgeEditorHandle>();
    render(
        <KnowledgeEditor ref={editor} value={groupedBody} onChange={change} />,
    );
    await waitFor(() => expect(editor.current).not.toBeNull());
    expect(
        screen.getAllByRole('button', { name: 'Block settings: Practice set' }),
    ).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Write here…' })).toHaveLength(
        1,
    );
    expect(change).not.toHaveBeenCalled();
});

it('does not show writable gaps inside legacy source-linked audio questions', async () => {
    const audioId = '77777777-7777-4777-8777-777777777777';
    const segment = '88888888-8888-4888-8888-888888888888';
    const audio = {
        id: audioId,
        type: 'audio',
        title: 'Legacy listening',
        transcript: {
            language: 'en',
            segments: [{ id: segment, text: 'A prepared passage.' }],
        },
    };
    const { group: _group1, ...first } = question1;
    const { group: _group2, ...second } = question2;
    const linked = (block: typeof first) => ({
        ...block,
        source: { blockId: audioId, segmentIds: [segment] },
    });
    const value = KnowledgeBodySchema.parse({
        schemaVersion: 2,
        document: {
            type: 'doc',
            content: [
                { type: 'learningBlock', attrs: { block: audio } },
                { type: 'paragraph' },
                { type: 'learningBlock', attrs: { block: linked(first) } },
                { type: 'paragraph' },
                { type: 'learningBlock', attrs: { block: linked(second) } },
            ],
        },
    });
    const change = vi.fn();
    const editor = createRef<KnowledgeEditorHandle>();
    render(<KnowledgeEditor ref={editor} value={value} onChange={change} />);
    await waitFor(() => expect(editor.current).not.toBeNull());
    expect(
        screen.getAllByRole('button', { name: /^Block settings:/ }),
    ).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'Write here…' })).toHaveLength(
        1,
    );
    expect(change).not.toHaveBeenCalled();
});

it.each(['paragraph', 'table', 'hard-break', 'added-question'] as const)(
    'rejects a captured group edit after %s is inserted between or after its members',
    async (kind) => {
        const { LearningBlockSchema } = await import('@languon/contracts');
        const { applyLearningBlockEdit } =
            await import('../src/fsd/features/knowledge-notes/lib/apply-learning-block-edit');
        const ref = createRef<KnowledgeEditorHandle>();
        const change = vi.fn();
        const { container } = render(
            <KnowledgeEditor ref={ref} value={body} onChange={change} />,
        );
        await waitFor(() => expect(ref.current).not.toBeNull());
        const host = container.querySelector(
            '[role="textbox"]',
        ) as HTMLElement & { editor: Editor };
        const editor = host.editor;
        let node: Record<string, unknown> = {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Keep my intervening prose.' }],
        };
        if (kind === 'hard-break')
            node = { type: 'paragraph', content: [{ type: 'hardBreak' }] };
        if (kind === 'table')
            node = {
                type: 'table',
                content: [
                    {
                        type: 'tableRow',
                        content: [
                            {
                                type: 'tableCell',
                                content: [
                                    {
                                        type: 'paragraph',
                                        content: [
                                            {
                                                type: 'text',
                                                text: 'Keep my table.',
                                            },
                                        ],
                                    },
                                ],
                            },
                        ],
                    },
                ],
            };
        if (kind === 'added-question')
            node = {
                type: 'learningBlock',
                attrs: {
                    block: {
                        ...question2,
                        id: crypto.randomUUID(),
                        question: 'A newer question.',
                    },
                },
            };
        act(() => {
            editor.commands.insertContentAt(
                kind === 'added-question' ? 2 : 1,
                node,
            );
        });
        const before = editor.getJSON();
        const calls = change.mock.calls.length;
        act(() => {
            expect(
                applyLearningBlockEdit(
                    editor,
                    [
                        LearningBlockSchema.parse(question1),
                        LearningBlockSchema.parse(question2),
                    ],
                    [
                        LearningBlockSchema.parse({
                            ...question1,
                            question: 'A stale replacement.',
                        }),
                        LearningBlockSchema.parse(question2),
                    ],
                ),
            ).toBe(false);
        });
        expect(editor.getJSON()).toEqual(before);
        expect(change).toHaveBeenCalledTimes(calls);
        expect(ref.current?.getSnapshot().content).not.toContain(
            'A stale replacement.',
        );
    },
);
