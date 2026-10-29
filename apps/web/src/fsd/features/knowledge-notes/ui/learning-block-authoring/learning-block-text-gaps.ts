import { authoringBlockGroup } from '../../lib/authoring-block-group';
import { blocksInDocument } from '../../lib/positioned-learning-blocks';
import { Extension } from '@tiptap/core';
import type { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, TextSelection } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';
import type { LearningBlock } from '@languon/contracts';
import styles from './learning-block-node.module.css';

/** Writable prose affordances are editor decorations, never raw HTML or synthetic saved content. */
export const LearningBlockTextGaps = Extension.create<{ label: string }>({
    name: 'learningBlockTextGaps',
    addOptions() {
        return { label: 'Write here…' };
    },
    addProseMirrorPlugins() {
        const label = this.options.label;
        const editor = this.editor;
        // Decoration lookups also run for focus/selection-only updates. Documents
        // are immutable, so avoid rescanning thousands of prose nodes each time.
        const byDocument = new WeakMap<ProseMirrorNode, DecorationSet>();
        return [
            new Plugin({
                props: {
                    decorations(state) {
                        if (!editor.isEditable) return null;
                        const cached = byDocument.get(state.doc);
                        if (cached) return cached;
                        const decorations: Decoration[] = [];
                        const positioned = blocksInDocument(state.doc);
                        const ends = new Map<string, string>();
                        const hiddenParagraphs = new Set<number>();
                        for (const item of positioned) {
                            if (ends.has(item.block.id)) continue;
                            const group = authoringBlockGroup(
                                positioned,
                                item.block.id,
                            );
                            const tail = group[group.length - 1]!.block.id;
                            for (let index = 0; index < group.length; index++) {
                                const member = group[index]!;
                                ends.set(member.block.id, tail);
                                const previous = group[index - 1];
                                if (
                                    previous &&
                                    previous.position + previous.size <
                                        member.position
                                ) {
                                    state.doc.nodesBetween(
                                        previous.position + previous.size,
                                        member.position,
                                        (node, position) => {
                                            if (
                                                node.type.name ===
                                                    'paragraph' &&
                                                node.childCount === 0
                                            )
                                                hiddenParagraphs.add(position);
                                            return false;
                                        },
                                    );
                                }
                            }
                        }
                        state.doc.forEach((node, position, index) => {
                            if (hiddenParagraphs.has(position)) {
                                decorations.push(
                                    Decoration.node(
                                        position,
                                        position + node.nodeSize,
                                        { class: styles.groupSpacer! },
                                    ),
                                );
                                return;
                            }
                            if (node.type.name !== 'learningBlock') return;
                            const next = state.doc.maybeChild(index + 1);
                            const block = node.attrs.block as LearningBlock;
                            if (ends.get(block.id) !== block.id) return;
                            const at = position + node.nodeSize;
                            if (next?.type.name === 'paragraph') {
                                if (next.childCount === 0)
                                    decorations.push(
                                        Decoration.node(
                                            at,
                                            at + next.nodeSize,
                                            {
                                                class: styles.gapParagraph!,
                                                'data-placeholder': label,
                                            },
                                        ),
                                    );
                                return;
                            }
                            decorations.push(
                                Decoration.widget(
                                    at,
                                    (view) => {
                                        const button =
                                            document.createElement('button');
                                        button.type = 'button';
                                        button.className = styles.textGap!;
                                        button.textContent = label;
                                        button.setAttribute(
                                            'contenteditable',
                                            'false',
                                        );
                                        button.addEventListener(
                                            'mousedown',
                                            (event) => event.preventDefault(),
                                        );
                                        button.addEventListener('click', () => {
                                            if (!view.editable) return;
                                            const transaction =
                                                view.state.tr.insert(
                                                    at,
                                                    view.state.schema.nodes.paragraph!.create(),
                                                );
                                            transaction.setSelection(
                                                TextSelection.near(
                                                    transaction.doc.resolve(
                                                        at + 1,
                                                    ),
                                                ),
                                            );
                                            view.dispatch(transaction);
                                            view.focus();
                                        });
                                        return button;
                                    },
                                    {
                                        side: 1,
                                        key: `write-after-${block.id}-${at}`,
                                    },
                                ),
                            );
                        });
                        const result = DecorationSet.create(
                            state.doc,
                            decorations,
                        );
                        byDocument.set(state.doc, result);
                        return result;
                    },
                },
            }),
        ];
    },
});
