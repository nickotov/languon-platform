import type { Editor } from '@tiptap/core';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { KnowledgeBodySchema } from '@languon/contracts';
import { KnowledgeEditor } from '../src/fsd/features/knowledge-notes';
import { render } from './render';

const paragraph = (text: string) => ({
    type: 'paragraph',
    content: [{ type: 'text', text }],
});
const body = KnowledgeBodySchema.parse({
    schemaVersion: 1,
    document: {
        type: 'doc',
        content: [
            paragraph('First passage'),
            {
                type: 'heading',
                attrs: { level: 2 },
                content: [{ type: 'text', text: 'Section title' }],
            },
            {
                type: 'bulletList',
                content: [
                    { type: 'listItem', content: [paragraph('Nested entry')] },
                ],
            },
            { type: 'blockquote', content: [paragraph('A quotation')] },
            {
                type: 'table',
                content: [
                    {
                        type: 'tableRow',
                        content: [
                            {
                                type: 'tableCell',
                                attrs: {
                                    colspan: 1,
                                    rowspan: 1,
                                    colwidth: null,
                                },
                                content: [paragraph('Cell content')],
                            },
                        ],
                    },
                ],
            },
            paragraph('Last passage'),
        ],
    },
});

it.each([
    ['First passage', 'Paragraph', 'paragraph'],
    ['Section title', 'Heading 2', 'heading'],
    ['Nested entry', 'Bullet list', 'bulletList'],
    ['A quotation', 'Quotation', 'blockquote'],
    ['Cell content', 'Insert table', 'table'],
])(
    'selects the complete %s block without mutating content',
    async (text, label, kind) => {
        const changed = vi.fn();
        const { container } = render(
            <KnowledgeEditor value={body} onChange={changed} />,
        );
        const element = await screen.findByText(text);
        fireEvent.mouseMove(element);
        fireEvent.click(
            screen.getByRole('button', {
                name: `Select or drag block: ${label}`,
            }),
        );
        const editor = (
            container.querySelector('[role="textbox"]') as HTMLElement & {
                editor: Editor;
            }
        ).editor;
        expect(editor.state.selection.toJSON()).toMatchObject({ type: 'node' });
        expect(
            editor.state.doc.nodeAt(editor.state.selection.from)?.type.name,
        ).toBe(kind);
        expect(changed).not.toHaveBeenCalled();
    },
);

it('moves complete nested blocks with the keyboard and supports undo', async () => {
    const changed = vi.fn();
    const { container } = render(
        <KnowledgeEditor value={body} onChange={changed} />,
    );
    fireEvent.mouseMove(await screen.findByText('Nested entry'));
    fireEvent.keyDown(
        screen.getByRole('button', {
            name: 'Select or drag block: Bullet list',
        }),
        { key: 'ArrowUp', altKey: true },
    );
    const editor = (
        container.querySelector('[role="textbox"]') as HTMLElement & {
            editor: Editor;
        }
    ).editor;
    expect(editor.getJSON().content?.[1]).toEqual(body.document.content![2]);
    expect(changed).toHaveBeenCalledOnce();
    // JSDOM has no Range geometry; scrolling is verified by the real browser.
    editor.view.setProps({ handleScrollToSelection: () => true });
    act(() => {
        editor.commands.undo();
    });
    expect(editor.getJSON().content?.[2]).toEqual(body.document.content![2]);
});

it('serializes a complete native drag slice and rejects a stale drop', async () => {
    const { container } = render(
        <KnowledgeEditor value={body} onChange={vi.fn()} />,
    );
    fireEvent.mouseMove(await screen.findByText('First passage'));
    const handle = screen.getByRole('button', {
        name: 'Select or drag block: Paragraph',
    });
    const dataTransfer = {
        clearData: vi.fn(),
        setData: vi.fn(),
        setDragImage: vi.fn(),
        effectAllowed: '',
    };
    fireEvent.dragStart(handle, { dataTransfer });
    const editor = (
        container.querySelector('[role="textbox"]') as HTMLElement & {
            editor: Editor;
        }
    ).editor;
    expect(editor.view.dragging?.slice.content.firstChild?.type.name).toBe(
        'paragraph',
    );
    expect(dataTransfer.setData).toHaveBeenCalledWith(
        'text/html',
        expect.stringContaining('>First passage</p>'),
    );
    act(() => {
        editor.commands.insertContentAt(
            editor.state.doc.content.size,
            paragraph('Newer prose'),
        );
    });
    const current = editor.getJSON();
    const event = new Event('drop', { cancelable: true }) as DragEvent;
    expect(
        editor.view.someProp('handleDrop', (handler) =>
            handler(editor.view, event, editor.state.selection.content(), true),
        ),
    ).toBe(true);
    expect(event.defaultPrevented).toBe(true);
    expect(editor.getJSON()).toEqual(current);
    expect(editor.view.dragging).toBeNull();
});

it('hides ordinary drag controls when the editor becomes read-only', async () => {
    const change = vi.fn();
    const { container } = render(
        <KnowledgeEditor value={body} onChange={change} />,
    );
    fireEvent.mouseMove(await screen.findByText('First passage'));
    expect(
        screen.getByRole('button', { name: 'Select or drag block: Paragraph' }),
    ).toBeVisible();
    const editor = (
        container.querySelector('[role="textbox"]') as HTMLElement & {
            editor: Editor;
        }
    ).editor;
    act(() => {
        editor.setEditable(false);
    });
    await waitFor(() =>
        expect(
            screen.queryByRole('button', { name: /^Select or drag block:/ }),
        ).toBeNull(),
    );
    expect(change).not.toHaveBeenCalled();
});

it('exposes the current block from keyboard focus and pointer input without hovering', async () => {
    const { container } = render(
        <KnowledgeEditor value={body} onChange={vi.fn()} />,
    );
    await screen.findByText('First passage');
    const editor = (
        container.querySelector('[role="textbox"]') as HTMLElement & {
            editor: Editor;
        }
    ).editor;
    act(() => {
        editor.view.focus();
    });
    expect(
        screen.getByRole('button', { name: 'Select or drag block: Paragraph' }),
    ).toBeVisible();
    fireEvent.pointerDown(screen.getByText('A quotation'), {
        pointerType: 'touch',
    });
    expect(
        screen.getByRole('button', { name: 'Select or drag block: Quotation' }),
    ).toBeVisible();
});

it('keeps the handle reachable across editor padding and the external gutter gap', async () => {
    const { container } = render(
        <KnowledgeEditor value={body} onChange={vi.fn()} />,
    );
    const paragraph = await screen.findByText('First passage');
    fireEvent.mouseMove(paragraph);
    const handle = screen.getByRole('button', {
        name: 'Select or drag block: Paragraph',
    });
    const host = container.querySelector('[role="textbox"]') as HTMLElement;
    vi.spyOn(paragraph, 'getBoundingClientRect').mockReturnValue(
        new DOMRect(280, 100, 600, 24),
    );
    vi.spyOn(handle, 'getBoundingClientRect').mockReturnValue(
        new DOMRect(256, 100, 20, 28),
    );
    // Move from prose through its padding, leave the host, then cross the 4px
    // external gap. The control must remain available at every boundary.
    fireEvent.mouseMove(host, { clientX: 281, clientY: 112 });
    fireEvent.mouseLeave(host.parentElement!, {
        relatedTarget: document.body,
        clientX: 278,
        clientY: 112,
    });
    fireEvent.mouseMove(document.body, { clientX: 278, clientY: 112 });
    expect(handle).toBeVisible();
    fireEvent.mouseMove(handle, { clientX: 266, clientY: 112 });
    expect(handle).toBeVisible();
    fireEvent.click(handle);
    const editor = (host as HTMLElement & { editor: Editor }).editor;
    expect(editor.state.selection.toJSON()).toMatchObject({ type: 'node' });
    fireEvent.mouseMove(document.body, { clientX: 100, clientY: 50 });
    expect(handle).not.toBeVisible();
});

it('does not retarget a hovered handle to the caret on unrelated view updates', async () => {
    const { container } = render(
        <KnowledgeEditor value={body} onChange={vi.fn()} />,
    );
    await screen.findByText('Section title');
    const editor = (
        container.querySelector('[role="textbox"]') as HTMLElement & {
            editor: Editor;
        }
    ).editor;
    act(() => {
        editor.commands.setTextSelection(
            editor.state.doc.child(0).nodeSize + 1,
        );
        editor.view.focus();
    });
    fireEvent.mouseMove(screen.getByText('First passage'));
    act(() => {
        editor.view.updateState(editor.state);
    });
    expect(
        screen.getByRole('button', { name: 'Select or drag block: Paragraph' }),
    ).toBeVisible();
    expect(
        screen.queryByRole('button', {
            name: 'Select or drag block: Heading 2',
        }),
    ).toBeNull();
});

const groupedBody = KnowledgeBodySchema.parse({
    schemaVersion: 2,
    document: {
        type: 'doc',
        content: [
            paragraph('Before group'),
            ...[
                '11111111-1111-4111-8111-111111111111',
                '22222222-2222-4222-8222-222222222222',
            ].map((id, index) => ({
                type: 'learningBlock',
                attrs: {
                    block: {
                        id,
                        type: 'exercise',
                        format: 'free-text',
                        question: `Question ${index + 1}`,
                        referenceAnswer: 'Reference',
                        explanation: 'Prepared reason',
                        group: {
                            id: '33333333-3333-4333-8333-333333333333',
                            title: 'Atomic set',
                        },
                    },
                },
            })),
            paragraph('After group'),
        ],
    },
});

it('keyboard moves cross the complete exercise group without pointer discovery', async () => {
    const { container } = render(
        <KnowledgeEditor value={groupedBody} onChange={vi.fn()} />,
    );
    const host = await screen.findByRole('textbox');
    fireEvent.keyDown(host, { key: 'ArrowDown', altKey: true });
    const editor = (
        container.querySelector('[role="textbox"]') as HTMLElement & {
            editor: Editor;
        }
    ).editor;
    expect(editor.state.doc.child(0).type.name).toBe('learningBlock');
    expect(editor.state.doc.child(1).type.name).toBe('learningBlock');
    expect(editor.state.doc.child(2).textContent).toBe('Before group');
});

it('snaps an ordinary drop between exercise members to the full group boundary', async () => {
    const { container } = render(
        <KnowledgeEditor value={groupedBody} onChange={vi.fn()} />,
    );
    fireEvent.mouseMove(await screen.findByText('After group'));
    const editor = (
        container.querySelector('[role="textbox"]') as HTMLElement & {
            editor: Editor;
        }
    ).editor;
    const between =
        editor.state.doc.child(0).nodeSize + editor.state.doc.child(1).nodeSize;
    vi.spyOn(editor.view, 'posAtCoords').mockReturnValue({
        pos: between,
        inside: -1,
    });
    editor.view.setProps({ handleScrollToSelection: () => true });
    fireEvent.dragStart(
        screen.getByRole('button', { name: 'Select or drag block: Paragraph' }),
        {
            dataTransfer: {
                clearData: vi.fn(),
                setData: vi.fn(),
                setDragImage: vi.fn(),
                effectAllowed: '',
            },
        },
    );
    const event = new MouseEvent('drop', { cancelable: true }) as DragEvent;
    expect(
        editor.view.someProp('handleDrop', (handler) =>
            handler(editor.view, event, editor.view.dragging!.slice, true),
        ),
    ).toBe(true);
    expect(editor.state.doc.child(1).textContent).toBe('After group');
    expect(editor.state.doc.child(2).attrs.block.question).toBe('Question 1');
    expect(editor.state.doc.child(3).attrs.block.question).toBe('Question 2');
});
