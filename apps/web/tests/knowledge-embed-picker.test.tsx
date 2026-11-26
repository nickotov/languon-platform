import type { Editor } from '@tiptap/core';
import { act, fireEvent, screen, within } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { KnowledgeBodySchema, type KnowledgeBody } from '@languon/contracts';
import { KnowledgeEditor } from '@/fsd/features/knowledge-notes';
import { render } from './render';

async function openPicker() {
    const body = KnowledgeBodySchema.parse({
        schemaVersion: 2,
        document: {
            type: 'doc',
            content: [
                {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'First last' }],
                },
                { type: 'paragraph', content: [{ type: 'text', text: 'End' }] },
            ],
        },
    });
    const onChange = vi.fn<(next: KnowledgeBody) => void>();
    render(
        <KnowledgeEditor
            value={body}
            onChange={onChange}
            label='Source document'
        />,
    );

    const source = await screen.findByRole('textbox', {
        name: 'Source document',
    });
    const editor = (source as HTMLElement & { editor: Editor }).editor;
    act(() => {
        editor.commands.setTextSelection(7);
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Add block' }));

    return { body, editor, onChange };
}

async function chooseBasic(kind: 'Website' | 'Image') {
    fireEvent.click(
        await screen.findByRole('button', { name: 'Basic blocks' }),
    );

    fireEvent.click(
        await screen.findByRole('button', { name: kind, exact: true }),
    );

    const dialog = await screen.findByRole('dialog', { name: kind });
    const input = within(dialog).getByRole('textbox', { name: `${kind} URL` });

    return { dialog, input };
}

it('finds and opens the existing Video authoring form by searching for YouTube', async () => {
    const { onChange } = await openPicker();
    const search = await screen.findByRole('textbox', {
        name: 'Search blocks and exercises',
    });

    fireEvent.change(search, { target: { value: 'YouTube' } });
    fireEvent.click(screen.getByRole('button', { name: 'Video', exact: true }));
    expect(
        await screen.findByLabelText('YouTube link or HTTPS video URL'),
    ).toBeVisible();

    expect(onChange).not.toHaveBeenCalled();
});

it('cancels a website insertion without changing the document or moving the caret', async () => {
    const { body, editor, onChange } = await openPicker();
    const { dialog, input } = await chooseBasic('Website');
    fireEvent.change(input, {
        target: { value: 'https://example.org/lesson' },
    });

    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(dialog).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    expect(editor.getJSON()).toMatchObject(body.document);
    expect(editor.state.selection.from).toBe(7);
    expect(editor.state.selection.to).toBe(7);
});

it('keeps an invalid image URL editable and inserts the corrected URL at the captured caret', async () => {
    const { editor, onChange } = await openPicker();
    const { dialog, input } = await chooseBasic('Image');
    const insert = within(dialog).getByRole('button', { name: 'Insert' });
    fireEvent.change(input, {
        target: { value: 'http://example.org/photo.png' },
    });

    fireEvent.click(insert);

    expect(input).toHaveValue('http://example.org/photo.png');
    expect(input).toHaveFocus();
    expect(within(dialog).getByRole('alert')).toBeVisible();
    expect(onChange).not.toHaveBeenCalled();

    // The editor selection can change while the modal has focus. The original
    // insertion target is authoritative when the corrected form is submitted.
    act(() => {
        editor.commands.setTextSelection(editor.state.doc.content.size - 1);
    });

    const src = 'https://example.org/photo.png';
    fireEvent.change(input, { target: { value: src } });
    fireEvent.click(insert);
    expect(dialog).not.toBeInTheDocument();
    expect(onChange.mock.lastCall?.[0].document.content).toEqual([
        { type: 'paragraph', content: [{ type: 'text', text: 'First ' }] },
        { type: 'imageEmbed', attrs: { src } },
        { type: 'paragraph', content: [{ type: 'text', text: 'last' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'End' }] },
    ]);
});
