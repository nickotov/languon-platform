import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { expect, it, vi } from 'vitest';
import { captureBlockInsertion } from '../src/fsd/features/knowledge-notes/lib/block-insertion-bookmark';

it('maps a captured cursor through edits and releases its transaction listener', () => {
    const editor = new Editor({
        extensions: [StarterKit],
        content: '<p>Some prose</p>',
    });
    editor.commands.setTextSelection(3);
    const bookmark = captureBlockInsertion(editor)!;
    editor.commands.insertContentAt(1, 'xx');
    expect(bookmark.resolve()).toBe(5);
    const off = vi.spyOn(editor, 'off');
    bookmark.release();
    expect(off).toHaveBeenCalledWith('transaction', expect.any(Function));
    editor.destroy();
    expect(bookmark.resolve()).toBeNull();
});
it('invalidates a captured point removed during a draft flush', () => {
    const editor = new Editor({
        extensions: [StarterKit],
        content: '<p>Some prose</p>',
    });
    editor.commands.setTextSelection(3);
    const bookmark = captureBlockInsertion(editor)!;
    editor.commands.deleteRange({ from: 1, to: 7 });
    expect(bookmark.resolve()).toBeNull();
    bookmark.release();
    editor.destroy();
});
