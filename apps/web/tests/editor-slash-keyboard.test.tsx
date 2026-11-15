import { act, fireEvent, renderHook } from '@testing-library/react';
import { Editor, Node } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { expect, it } from 'vitest';
import { insertBlocksAtTarget } from '../src/fsd/features/knowledge-notes/lib/editor-insertion-target';
import { useEditorInsertPicker } from '../src/fsd/features/knowledge-notes/hooks/use-editor-insert-picker';

const LearningNode = Node.create({
    name: 'learningBlock',
    group: 'block',
    atom: true,
    addAttributes: () => ({ block: { default: null } }),
    parseHTML: () => [{ tag: 'aside' }],
    renderHTML: () => ['aside'],
});

it('opens from the editor-owned keyboard pipeline after a learning block and keeps slash on cancellation', () => {
    const editor = new Editor({
        extensions: [StarterKit, LearningNode],
        content: '<aside></aside><p></p>',
    });
    const { result, unmount } = renderHook(() =>
        useEditorInsertPicker(editor, false),
    );

    act(() => {
        editor.commands.setTextSelection(2);
    });

    fireEvent.keyDown(editor.view.dom, { key: '/' });
    expect(result.current.open).toBe(true);
    expect(editor.getText()).toContain('/');
    act(() => result.current.close());
    expect(result.current.open).toBe(false);
    expect(editor.getText()).toContain('/');
    unmount();
    editor.destroy();
});

it('does not intercept slash inside a word or while composing', () => {
    const editor = new Editor({
        extensions: [StarterKit],
        content: '<p>word</p>',
    });
    const { result, unmount } = renderHook(() =>
        useEditorInsertPicker(editor, false),
    );

    act(() => {
        editor.commands.setTextSelection(3);
    });

    const inline = new KeyboardEvent('keydown', {
        key: '/',
        bubbles: true,
        cancelable: true,
    });

    editor.view.dom.dispatchEvent(inline);
    expect(inline.defaultPrevented).toBe(false);
    expect(result.current.open).toBe(false);
    act(() => {
        editor.commands.setTextSelection(1);
    });

    const composing = new KeyboardEvent('keydown', {
        key: '/',
        bubbles: true,
        cancelable: true,
        isComposing: true,
    });

    editor.view.dom.dispatchEvent(composing);
    expect(composing.defaultPrevented).toBe(false);
    expect(result.current.open).toBe(false);
    unmount();
    editor.destroy();
});

it('button insertion preserves selected blocks across sequential manual additions and individual undo', () => {
    const first = {
        id: '11111111-1111-4111-8111-111111111111',
        type: 'grammar' as const,
        language: 'en',
        rule: 'First rule',
    };
    const second = {
        ...first,
        id: '22222222-2222-4222-8222-222222222222',
        rule: 'Second rule',
    };
    const third = {
        ...first,
        id: '33333333-3333-4333-8333-333333333333',
        rule: 'Third rule',
    };
    const editor = new Editor({
        extensions: [StarterKit, LearningNode],
        content: {
            type: 'doc',
            content: [
                { type: 'learningBlock', attrs: { block: first } },
                {
                    type: 'paragraph',
                    content: [{ type: 'text', text: 'Preserve this prose.' }],
                },
            ],
        },
    });
    const { result, unmount } = renderHook(() =>
        useEditorInsertPicker(editor, false),
    );
    const blockIds = () =>
        editor
            .getJSON()
            .content!.filter((node) => node.type === 'learningBlock')
            .map((node) => node.attrs!.block.id);

    act(() => {
        editor.commands.setNodeSelection(0);
        result.current.show();
    });

    expect(result.current.target.current!.resolve()).toEqual({
        from: 1,
        to: 1,
    });

    act(() => {
        expect(
            insertBlocksAtTarget(editor, result.current.target.current!, [
                second,
            ]),
        ).toBe(true);

        result.current.close();
    });

    expect(blockIds()).toEqual([first.id, second.id]);
    act(() => {
        editor.commands.setNodeSelection(1);
        result.current.show();
    });

    expect(result.current.target.current!.resolve()).toEqual({
        from: 2,
        to: 2,
    });

    act(() => {
        expect(
            insertBlocksAtTarget(editor, result.current.target.current!, [
                third,
            ]),
        ).toBe(true);

        result.current.close();
    });

    expect(blockIds()).toEqual([first.id, second.id, third.id]);
    expect(editor.state.doc.textContent).toBe('Preserve this prose.');
    act(() => {
        expect(editor.commands.undo()).toBe(true);
    });

    expect(blockIds()).toEqual([first.id, second.id]);
    act(() => {
        expect(editor.commands.undo()).toBe(true);
    });

    expect(blockIds()).toEqual([first.id]);
    expect(editor.state.doc.textContent).toBe('Preserve this prose.');
    unmount();
    editor.destroy();
});

it('button insertion goes after selected prose instead of replacing it', () => {
    const editor = new Editor({
        extensions: [StarterKit, LearningNode],
        content: '<p>Keep these words.</p>',
    });
    const original = editor.getJSON();
    const block = {
        id: '11111111-1111-4111-8111-111111111111',
        type: 'grammar' as const,
        language: 'en',
        rule: 'New rule',
    };
    const { result, unmount } = renderHook(() =>
        useEditorInsertPicker(editor, false),
    );

    act(() => {
        editor.commands.setTextSelection({ from: 1, to: 5 });
        result.current.show();
    });

    expect(result.current.target.current!.resolve()).toEqual({
        from: 5,
        to: 5,
    });

    act(() => {
        expect(
            insertBlocksAtTarget(editor, result.current.target.current!, [
                block,
            ]),
        ).toBe(true);

        result.current.close();
    });

    expect(editor.state.doc.textContent).toBe('Keep these words.');
    act(() => {
        expect(editor.commands.undo()).toBe(true);
    });

    expect(editor.getJSON()).toEqual(original);
    unmount();
    editor.destroy();
});
