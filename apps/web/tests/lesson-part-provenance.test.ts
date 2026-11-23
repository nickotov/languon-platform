import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { expect, it } from 'vitest';
import { LessonPartProvenance } from '../src/fsd/features/knowledge-notes/lib/lesson-part-provenance';

it('retains lesson identity through editing and JSON reload, without copying it into HTML or the next new paragraph', () => {
    const lessonPartId = `${crypto.randomUUID()}/reading`;
    const extensions = [StarterKit, LessonPartProvenance];
    const editor = new Editor({
        extensions,
        content: {
            type: 'doc',
            content: [
                {
                    type: 'paragraph',
                    attrs: { lessonPartId },
                    content: [{ type: 'text', text: 'Vote' }],
                },
            ],
        },
    });

    editor.commands.setTextSelection(5);
    editor.commands.insertContent('!');
    editor.commands.splitBlock();
    const saved = editor.getJSON();
    expect(saved.content?.map((node) => node.attrs?.lessonPartId)).toEqual([
        lessonPartId,
        null,
    ]);

    expect(editor.getHTML()).not.toContain(lessonPartId);
    editor.commands.setContent(saved);
    expect(editor.getJSON()).toEqual(saved);
    editor.commands.setTextSelection(3);
    editor.commands.splitBlock();
    expect(
        editor.getJSON().content?.map((node) => node.attrs?.lessonPartId),
    ).toEqual([lessonPartId, lessonPartId, null]);

    editor.commands.setContent(`<p lessonpartid="${lessonPartId}">pasted</p>`);
    expect(editor.getJSON().content?.[0]?.attrs?.lessonPartId).toBeNull();
    editor.destroy();
});
