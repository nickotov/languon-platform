import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { prepareProposalDocument } from '@/fsd/features/knowledge-notes/lib/insert-proposal-document';
import { expect, it } from 'vitest';
import {
    KnowledgeEditorDocument,
    ImageEmbedNode,
    WebsiteEmbedNode,
} from '@/fsd/features/knowledge-notes/ui/editor-embed-node/editor-embed-node';
import {
    captureEditorInsertion,
    insertNodesAtTarget,
} from '@/fsd/features/knowledge-notes/lib/editor-insertion-target';
import { normalizeEditorDocument } from '@/fsd/features/knowledge-notes/lib/editor-document';
import {
    hasKnowledgeText,
    knowledgePlainText,
} from '@/fsd/pages/knowledge/lib/workspace-document';

const extensions = [
    StarterKit.configure({ document: false }),
    KnowledgeEditorDocument,
    WebsiteEmbedNode,
    ImageEmbedNode,
];

it.each(['websiteEmbed', 'imageEmbed'] as const)(
    'inserts %s at a mapped slash, round trips and undoes once',
    (type) => {
        const editor = new Editor({
            extensions,
            content: '<p>Before / after</p>',
        });
        const embed = { type, attrs: { src: 'https://example.org/source' } };
        const target = captureEditorInsertion(editor, 8, 9);
        editor.commands.insertContentAt(1, 'New ');
        const before = editor.getJSON();

        expect(insertNodesAtTarget(editor, target, [embed])).toBe(true);
        const saved = normalizeEditorDocument(editor.getJSON());
        expect(saved.document.content?.map((child) => child.type)).toEqual([
            'paragraph',
            type,
            'paragraph',
        ]);

        expect(saved.document.content?.[1]).toEqual(embed);
        expect(editor.getText()).not.toContain('/');
        expect(hasKnowledgeText({ type: 'doc', content: [embed] })).toBe(true);
        expect(knowledgePlainText(saved.document)).toBe(
            'New Before \n\n\n after',
        );

        const reopened = new Editor({ extensions, content: editor.getJSON() });
        expect(normalizeEditorDocument(reopened.getJSON())).toEqual(saved);
        expect(editor.commands.undo()).toBe(true);
        expect(editor.getJSON()).toEqual(before);
        target.release();
        reopened.destroy();
        editor.destroy();
    },
);

it('keeps embeds at the document root when inserting inside a block quote', () => {
    const editor = new Editor({
        extensions,
        content: '<blockquote><p>Before / after</p></blockquote>',
    });
    const embed = {
        type: 'imageEmbed',
        attrs: { src: 'https://example.org/image' },
    };
    const target = captureEditorInsertion(editor, 9, 10);
    expect(insertNodesAtTarget(editor, target, [embed])).toBe(true);
    const saved = normalizeEditorDocument(editor.getJSON());
    expect(saved.document.content).toContainEqual(embed);
    expect(editor.state.doc.textContent).toBe('Before  after');
    target.release();
    editor.destroy();
});

it('preserves a serialized link and ignores competing HTML attributes on paste', () => {
    const editor = new Editor({
        extensions,
        content:
            '<div data-knowledge-embed="websiteEmbed" data-src="https://example.org/saved" src="http://example.org/other"></div>',
    });
    const linkedContent = editor.getJSON().content?.[0];
    expect(linkedContent).toEqual({
        type: 'websiteEmbed',
        attrs: { src: 'https://example.org/saved' },
    });

    const copy = new Editor({ extensions, content: editor.getHTML() });
    expect(copy.getJSON()).toEqual(editor.getJSON());
    copy.destroy();
    editor.destroy();
});

it('protects embedded content when a text proposal spans it', () => {
    const editor = new Editor({
        extensions,
        content: {
            type: 'doc',
            content: [
                {
                    type: 'imageEmbed',
                    attrs: { src: 'https://example.org/figure' },
                },
            ],
        },
    });

    expect(
        prepareProposalDocument(
            editor,
            {
                type: 'doc',
                content: [
                    {
                        type: 'paragraph',
                        content: [{ type: 'text', text: 'Suggestion' }],
                    },
                ],
            },
            { from: 0, to: 1 },
            false,
        ),
    ).toBeNull();

    expect(editor.getJSON().content?.[0]?.type).toBe('imageEmbed');
    editor.destroy();
});
