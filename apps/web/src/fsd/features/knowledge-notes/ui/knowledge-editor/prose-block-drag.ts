import { Extension } from '@tiptap/core';
import type { Node as DocumentNode } from '@tiptap/pm/model';
import { Plugin } from '@tiptap/pm/state';
import {
    adjacentBlockDestination,
    editorBlockRange,
} from '../../lib/editor-block-range';
import { moveEditorBlock } from '../../lib/move-editor-block';
import {
    createProseBlockDragView,
    type ProseDragState,
} from './prose-block-drag-view';

/** Ordinary nodes use native whole-node drag slices; the handle stays outside the editable DOM. */
export const ProseBlockDrag = Extension.create<{
    label: (node: DocumentNode) => string;
}>({
    name: 'proseBlockDrag',
    addOptions() {
        return { label: (node) => `Select or drag block: ${node.type.name}` };
    },
    addProseMirrorPlugins() {
        const label = this.options.label;
        const dragState: ProseDragState = { current: null };
        return [
            new Plugin({
                props: {
                    handleKeyDown(view, event) {
                        if (
                            !view.editable ||
                            !event.altKey ||
                            !['ArrowUp', 'ArrowDown'].includes(event.key)
                        )
                            return false;
                        const resolved = view.state.doc.resolve(
                            view.state.selection.from,
                        );
                        const at = resolved.depth
                            ? resolved.before(1)
                            : resolved.pos;
                        const node = view.state.doc.nodeAt(at);
                        const element = view.nodeDOM(at);
                        if (
                            !node ||
                            node.type.name === 'learningBlock' ||
                            !(element instanceof HTMLElement)
                        )
                            return false;
                        const destination = adjacentBlockDestination(
                            view.state.doc,
                            at,
                            event.key === 'ArrowUp' ? -1 : 1,
                        );
                        if (destination !== null)
                            moveEditorBlock(
                                view,
                                { position: at, node },
                                destination,
                            );
                        event.preventDefault();
                        return true;
                    },
                    handleDrop(view, event, _slice, moved) {
                        if (!dragState.current) return false;
                        const captured = dragState.current;
                        const stale =
                            !view.editable ||
                            captured.document !== view.state.doc;
                        dragState.current = null;
                        event.preventDefault();
                        view.dragging = null;
                        if (stale) return true;
                        const target = view.posAtCoords({
                            left: event.clientX,
                            top: event.clientY,
                        });
                        if (!target) return true;
                        const resolved = view.state.doc.resolve(target.pos);
                        let destination = target.pos;
                        if (resolved.depth > 0) {
                            const at = resolved.before(1);
                            const range = editorBlockRange(view.state.doc, at);
                            const element = view.nodeDOM(at);
                            if (!range || !(element instanceof HTMLElement))
                                return true;
                            const rect = element.getBoundingClientRect();
                            destination =
                                event.clientY < rect.top + rect.height / 2
                                    ? range.from
                                    : range.to;
                        } else if (target.pos < view.state.doc.content.size) {
                            destination =
                                editorBlockRange(view.state.doc, target.pos)
                                    ?.from ?? target.pos;
                        }
                        moveEditorBlock(
                            view,
                            captured.source,
                            destination,
                            !moved,
                        );
                        return true;
                    },
                },
                view(view) {
                    return createProseBlockDragView(view, label, dragState);
                },
            }),
        ];
    },
});
