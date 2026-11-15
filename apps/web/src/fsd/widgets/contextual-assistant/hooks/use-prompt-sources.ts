import { useEffect } from 'react';
import type { Editor } from '@tiptap/react';
import type { KnowledgeBlockReference } from '@/fsd/features/knowledge-notes';
import { replacePromptSelection } from '../lib/prompt-selection';
import { serializePrompt } from '../lib/prompt-document';

/** Add externally selected references and visibly retain unavailable sources. */
export function usePromptSources(
    editor: Editor | null,
    selectedBlocks: KnowledgeBlockReference[],
    blocks: KnowledgeBlockReference[],
) {
    useEffect(() => {
        if (!editor) {
            return;
        }

        const existing = serializePrompt(editor.getJSON()).promptMentions;
        const additions = selectedBlocks.filter(
            (block) =>
                !existing.some(
                    (item) =>
                        item.kind === 'block' && item.blockId === block.id,
                ),
        );

        const selected = new Set(selectedBlocks.map((block) => block.id));
        const available = new Set(blocks.map((block) => block.id));
        replacePromptSelection(
            editor,
            additions.flatMap((block) => [
                { type: 'text', text: ' ' },
                {
                    type: 'promptMention',
                    attrs: {
                        kind: 'block',
                        blockId: block.id,
                        label: block.title,
                        selectionOwner: 'references',
                    },
                },
            ]),
            (attrs) =>
                attrs.selectionOwner === 'references' &&
                !selected.has(String(attrs.blockId)) &&
                available.has(String(attrs.blockId)),
        );
    }, [editor, selectedBlocks, blocks]);

    useEffect(() => {
        if (!editor) {
            return;
        }

        const available = new Set(blocks.map((block) => block.id));
        const transaction = editor.state.tr.setMeta('promptSync', true);
        editor.state.doc.descendants((node, position) => {
            if (
                node.type.name !== 'promptMention' ||
                node.attrs.kind !== 'block'
            ) {
                return;
            }

            const missing = !available.has(node.attrs.blockId);
            if (Boolean(node.attrs.missing) !== missing) {
                transaction.setNodeMarkup(position, undefined, {
                    ...node.attrs,
                    missing,
                });
            }
        });

        if (transaction.docChanged) {
            editor.view.dispatch(transaction);
        }
    }, [editor, blocks]);
}
