import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';

// JSON retains the identity of inserted lesson prose while the author edits it.
// Omit it from HTML so copying, pasting or exporting prose cannot copy ownership.
export const LessonPartProvenance = Extension.create({
    name: 'lessonPartProvenance',
    addGlobalAttributes() {
        return [
            {
                types: [
                    'paragraph',
                    'heading',
                    'blockquote',
                    'bulletList',
                    'orderedList',
                    'horizontalRule',
                    'table',
                ],
                attributes: {
                    lessonPartId: {
                        default: null,
                        rendered: false,
                        parseHTML: () => null,
                        keepOnSplit: true,
                    },
                },
            },
        ];
    },
    addProseMirrorPlugins() {
        return [
            new Plugin({
                appendTransaction(transactions, previous, current) {
                    if (
                        !transactions.some(
                            (transaction) => transaction.docChanged,
                        )
                    ) {
                        return null;
                    }

                    const before = previous.doc.content;
                    const after = current.doc.content;
                    const from = before.findDiffStart(after);
                    const end = before.findDiffEnd(after);
                    if (from === null || !end) {
                        return null;
                    }

                    const transaction = current.tr;
                    // A split keeps both halves of existing prose. Empty paragraphs,
                    // including the next paragraph created by Enter, start unowned.
                    current.doc.nodesBetween(
                        Math.max(0, from - 1),
                        Math.min(after.size, Math.max(from, end.b) + 1),
                        (node, position) => {
                            if (
                                node.isTextblock &&
                                node.content.size === 0 &&
                                node.attrs.lessonPartId
                            ) {
                                transaction.setNodeAttribute(
                                    position,
                                    'lessonPartId',
                                    null,
                                );
                            }
                        },
                    );

                    return transaction.docChanged ? transaction : null;
                },
            }),
        ];
    },
});
