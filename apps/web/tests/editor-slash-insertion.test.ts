import { Editor, Node } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { expect, it } from 'vitest';
import {
    captureEditorInsertion,
    insertBlocksAtTarget,
} from '../src/fsd/features/knowledge-notes/lib/editor-insertion-target';

const block = {
    id: '11111111-1111-4111-8111-111111111111',
    type: 'grammar' as const,
    language: 'en',
    rule: 'Be kind.',
};
const LearningNode = Node.create({
    name: 'learningBlock',
    group: 'block',
    atom: true,
    addAttributes: () => ({ block: { default: null } }),
    parseHTML: () => [{ tag: 'aside' }],
    renderHTML: () => ['aside'],
});

it('replaces the mapped slash at the captured cursor rather than appending', () => {
    const editor = new Editor({
        extensions: [StarterKit, LearningNode],
        content: '<p>Before /</p><p>After</p>',
    });
    const target = captureEditorInsertion(editor, 8, 9);
    editor.commands.insertContentAt(1, 'New ');
    expect(target.resolve()).toEqual({ from: 12, to: 13 });
    expect(insertBlocksAtTarget(editor, target, [block])).toBe(true);
    expect(editor.getText()).not.toContain('/');
    const content = editor.getJSON().content!;
    expect(
        content.findIndex((node) => node.type === 'learningBlock'),
    ).toBeLessThan(
        content.findIndex((node) =>
            node.content?.some((child) => child.text === 'After'),
        ),
    );

    target.release();
    editor.destroy();
});

it('fails closed if the slash is deleted while a form is open', () => {
    const editor = new Editor({
        extensions: [StarterKit, LearningNode],
        content: '<p>/</p>',
    });
    const target = captureEditorInsertion(editor, 1, 2);
    editor.commands.deleteRange({ from: 1, to: 2 });
    expect(target.resolve()).toBeNull();
    expect(insertBlocksAtTarget(editor, target, [block])).toBe(false);
    target.release();
    editor.destroy();
});
