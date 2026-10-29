import { Editor, Node } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { NodeSelection, TextSelection } from '@tiptap/pm/state';
import { EditorContent } from '@tiptap/react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { I18nProvider } from '../src/fsd/shared/i18n';
import { en } from '../src/fsd/shared/i18n/messages/en';
import { WorkspaceEditorChrome } from '../src/fsd/features/knowledge-notes/ui/knowledge-editor/workspace-editor-chrome';

const block = {
    id: '11111111-1111-4111-8111-111111111111',
    type: 'grammar',
    rule: 'Use the present tense.',
    language: 'en',
};
const learningBlock = Node.create({
    name: 'learningBlock',
    group: 'block',
    atom: true,
    selectable: true,
    addAttributes: () => ({ block: { default: block } }),
    renderHTML: () => ['div', 'Use the present tense.'],
});
const editors: Editor[] = [];
afterEach(() => editors.splice(0).forEach((editor) => editor.destroy()));
function createEditor(content: object[]) {
    const editor = new Editor({
        extensions: [StarterKit, learningBlock],
        content: { type: 'doc', content },
    });
    editors.push(editor);
    return editor;
}
function chrome(editor: Editor) {
    return (
        <I18nProvider locale='en' messages={en}>
            <WorkspaceEditorChrome
                editor={editor}
                disabled={false}
                workspace={{
                    toolbarRootId: 'block-selection-toolbar',
                    editorId: 'block-selection-editor',
                    proposalRootId: 'block-selection-proposals',
                    onAskTutor: vi.fn(),
                    onAskOutline: vi.fn(),
                }}
            >
                <EditorContent editor={editor} />
            </WorkspaceEditorChrome>
        </I18nProvider>
    );
}

it.each([false, true])(
    'does not show prose actions or empty starters for a selected block (leading paragraph: %s)',
    (leadingParagraph) => {
        const content: object[] = [{ type: 'learningBlock', attrs: { block } }];
        if (leadingParagraph) content.unshift({ type: 'paragraph' });
        const editor = createEditor(content);
        const position = leadingParagraph ? 2 : 0;
        editor.view.dispatch(
            editor.state.tr.setSelection(
                NodeSelection.create(editor.state.doc, position),
            ),
        );
        render(chrome(editor));
        expect(
            screen.queryByRole('toolbar', {
                name: en['knowledge.selectionActions'],
            }),
        ).not.toBeInTheDocument();
        expect(
            screen.queryByRole('group', { name: en['knowledge.beginWriting'] }),
        ).not.toBeInTheDocument();
    },
);

it('keeps prose actions for selected text and removes them when the caret is collapsed', () => {
    const editor = createEditor([
        {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Selected prose' }],
        },
        { type: 'learningBlock', attrs: { block } },
    ]);
    const geometry = vi
        .spyOn(editor.view, 'coordsAtPos')
        .mockReturnValue({ top: 10, bottom: 30, left: 10, right: 80 });
    editor.view.dispatch(
        editor.state.tr.setSelection(
            TextSelection.create(editor.state.doc, 1, 9),
        ),
    );
    const view = render(chrome(editor));
    expect(
        screen.getByRole('toolbar', { name: en['knowledge.selectionActions'] }),
    ).toBeInTheDocument();
    act(() => {
        editor.view.dispatch(
            editor.state.tr.setSelection(
                TextSelection.create(editor.state.doc, 1),
            ),
        );
    });
    view.rerender(chrome(editor));
    expect(
        screen.queryByRole('toolbar', {
            name: en['knowledge.selectionActions'],
        }),
    ).not.toBeInTheDocument();
    geometry.mockRestore();
});
