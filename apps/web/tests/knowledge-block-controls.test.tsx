import { createRef } from 'react';
import type { Editor } from '@tiptap/core';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { KnowledgeBodySchema } from '@languon/contracts';
import {
    KnowledgeEditor,
    type KnowledgeEditorHandle,
} from '../src/fsd/features/knowledge-notes';
import { render } from './render';

const firstId = '11111111-1111-4111-8111-111111111111';
const secondId = '22222222-2222-4222-8222-222222222222';
const body = KnowledgeBodySchema.parse({
    schemaVersion: 2,
    document: {
        type: 'doc',
        content: [
            {
                type: 'learningBlock',
                attrs: {
                    block: {
                        id: firstId,
                        type: 'grammar',
                        title: 'First rule',
                        language: 'en',
                        rule: 'Use the present.',
                    },
                },
            },
            {
                type: 'paragraph',
                content: [
                    { type: 'text', text: 'Keep this passage between blocks.' },
                ],
            },
            {
                type: 'learningBlock',
                attrs: {
                    block: {
                        id: secondId,
                        type: 'grammar',
                        title: 'Second rule',
                        language: 'en',
                        rule: 'Use the past.',
                    },
                },
            },
            { type: 'paragraph' },
        ],
    },
});

async function choose(title: string, action: string) {
    fireEvent.click(
        await screen.findByRole('button', { name: `Block settings: ${title}` }),
    );
    fireEvent.click(
        await screen.findByRole('menuitem', { name: action, exact: true }),
    );
}

it('selects a draggable block without editing content and exposes actions in its heading menu', async () => {
    const changed = vi.fn();
    const { container } = render(
        <KnowledgeEditor value={body} onChange={changed} />,
    );
    const handle = await screen.findByRole('button', {
        name: 'Select or drag block: First rule',
    });
    expect(screen.queryByText('Manage blocks')).toBeNull();
    expect(
        screen.queryByRole('button', { name: 'Edit', exact: true }),
    ).toBeNull();
    expect(handle).toHaveAttribute('draggable', 'true');
    fireEvent.click(handle);
    await waitFor(() => expect(handle).toHaveAttribute('aria-pressed', 'true'));
    expect(handle.closest('[data-learning-block-id]')).toHaveAttribute(
        'data-selected',
        'true',
    );
    expect(changed.mock.calls[0]?.[0] ?? body).toEqual(body);

    expect(changed).not.toHaveBeenCalled();
    const heading = screen.getByRole('heading', {
        name: 'First rule',
    }).parentElement!;
    expect(
        within(heading).getByRole('button', {
            name: 'Block settings: First rule',
        }),
    ).toBeVisible();
    await choose('First rule', 'Edit');
    expect(await screen.findByLabelText('Rule')).toHaveValue(
        'Use the present.',
    );
    fireEvent.change(screen.getByLabelText('Rule'), {
        target: { value: 'Updated rule.' },
    });
    expect(changed).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Apply changes' }));
    await waitFor(() => expect(changed).toHaveBeenCalledOnce());
    expect(container.querySelectorAll('[data-learning-block-id]')).toHaveLength(
        2,
    );
    expect(JSON.stringify(changed.mock.lastCall?.[0])).toContain(
        'Updated rule.',
    );
});

it('duplicates with fresh identities, reorders without losing prose, and deletes only the chosen block', async () => {
    const changed = vi.fn();
    const ref = createRef<KnowledgeEditorHandle>();
    const { container } = render(
        <KnowledgeEditor ref={ref} value={body} onChange={changed} />,
    );
    await choose('Second rule', 'Move up');
    const document = changed.mock.lastCall?.[0].document;
    expect(document.content[0].attrs.block.id).toBe(secondId);
    expect(JSON.stringify(document)).toContain(
        'Keep this passage between blocks.',
    );
    await choose('First rule', 'Duplicate');
    const nodes = container.querySelectorAll('[data-learning-block-id]');
    expect(nodes).toHaveLength(3);
    const ids = Array.from(nodes, (node) =>
        node.getAttribute('data-learning-block-id'),
    );
    expect(new Set(ids).size).toBe(3);
    expect(ids).toContain(firstId);
    expect(ids).toContain(secondId);
    await choose('Second rule', 'Delete');
    expect(
        container.querySelector(`[data-learning-block-id="${secondId}"]`),
    ).toBeNull();
    expect(
        container.querySelector(`[data-learning-block-id="${firstId}"]`),
    ).not.toBeNull();
    expect(ref.current?.getSnapshot().content).toContain(
        'Keep this passage between blocks.',
    );
});

it('copies a whole block payload and allows host-specific settings alongside standard actions', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
        configurable: true,
        value: { writeText },
    });
    const extra = vi.fn();
    const getBlockActions = (block: { id: string }) =>
        block.id === firstId ? [{ label: 'Export rule', onSelect: extra }] : [];
    render(
        <KnowledgeEditor
            value={body}
            onChange={vi.fn()}
            getBlockActions={getBlockActions}
        />,
    );
    await choose('First rule', 'Copy block');
    expect(writeText).toHaveBeenCalledOnce();
    expect(writeText.mock.calls[0]?.[0]).toContain(firstId);
    expect(writeText.mock.calls[0]?.[0]).toContain('Use the present.');
    await choose('First rule', 'Export rule');
    expect(extra).toHaveBeenCalledOnce();
    fireEvent.click(
        screen.getByRole('button', { name: 'Block settings: Second rule' }),
    );
    expect(
        await screen.findByRole('menuitem', { name: 'Edit', exact: true }),
    ).toBeVisible();
    expect(screen.queryByRole('menuitem', { name: 'Export rule' })).toBeNull();
});

it('does not expose authoring controls when the editor is disabled', async () => {
    render(<KnowledgeEditor value={body} onChange={vi.fn()} disabled />);
    expect(
        await screen.findByRole('heading', { name: 'First rule' }),
    ).toBeVisible();
    expect(
        screen.queryByRole('button', { name: /^Block settings:/ }),
    ).toBeNull();
    expect(
        screen.queryByRole('button', { name: /^Select or drag block:/ }),
    ).toBeNull();
});

it('rejects copied learning-node drops before mutation while allowing ordinary moves and text drops', async () => {
    const changed = vi.fn();
    const { container } = render(
        <KnowledgeEditor value={body} onChange={changed} />,
    );
    await screen.findByRole('button', { name: 'Block settings: First rule' });
    const element = container.querySelector(
        '[role="textbox"]',
    ) as HTMLElement & { editor: Editor };
    const editor = element.editor;
    const original = editor.getJSON();
    const firstBlock = editor.state.doc.child(0);
    const copiedSlice = editor.state.doc.slice(0, firstBlock.nodeSize);
    const event = new Event('drop') as DragEvent;
    expect(
        editor.view.someProp('handleDrop', (handler) =>
            handler(editor.view, event, copiedSlice, false),
        ),
    ).toBe(true);
    expect(editor.getJSON()).toEqual(original);
    expect(changed).not.toHaveBeenCalled();
    // A false handler result lets ProseMirror perform the move with the original identity.
    let moveAllowed = false;
    editor.view.someProp('handleDrop', (handler) => {
        moveAllowed = handler(editor.view, event, copiedSlice, true) === false;
        return moveAllowed;
    });
    expect(moveAllowed).toBe(true);
    const paragraphPosition = firstBlock.nodeSize;
    const textSlice = editor.state.doc.slice(
        paragraphPosition + 1,
        paragraphPosition + 5,
    );
    let textAllowed = false;
    editor.view.someProp('handleDrop', (handler) => {
        textAllowed = handler(editor.view, event, textSlice, false) === false;
        return textAllowed;
    });
    expect(textAllowed).toBe(true);
});
