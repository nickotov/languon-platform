import { z } from 'zod';
import { Extension } from '@tiptap/core';
import { Plugin } from '@tiptap/pm/state';
import { authoringBlockGroup } from './authoring-block-group';
import { blocks } from './positioned-learning-blocks';
import { normalizeEditorDocument } from './editor-document';
export const exerciseGroupDragType = 'application/x-languon-exercise-set';
const groupIds = z.array(z.uuid()).min(2).max(26);

/** Drag transfers identities within this editor; serialized content/media never grants access. */
export const ExerciseGroupDrag = Extension.create({
    name: 'exerciseGroupDrag',
    addProseMirrorPlugins() {
        const editor = this.editor;
        return [
            new Plugin({
                props: {
                    handleDrop(view, event) {
                        const raw = event.dataTransfer?.getData(
                            exerciseGroupDragType,
                        );
                        if (!raw) return false;
                        event.preventDefault();
                        if (
                            !view.editable ||
                            event.ctrlKey ||
                            event.metaKey ||
                            event.altKey ||
                            raw.length > 2_000
                        )
                            return true;
                        try {
                            const ids = groupIds.parse(JSON.parse(raw));
                            const group = authoringBlockGroup(
                                blocks(editor),
                                ids[0]!,
                            );
                            if (
                                group.length !== ids.length ||
                                group.some(
                                    (item, index) =>
                                        item.block.id !== ids[index],
                                )
                            )
                                return true;
                            const members = group.map((item) => ({
                                at: item.position,
                                end: item.position + item.size,
                            }));
                            const target = view.posAtCoords({
                                left: event.clientX,
                                top: event.clientY,
                            });
                            if (!target) return true;
                            const resolved = view.state.doc.resolve(target.pos);
                            const destination =
                                resolved.depth > 0
                                    ? event.clientY <
                                      (view.coordsAtPos(target.pos).top +
                                          view.coordsAtPos(target.pos).bottom) /
                                          2
                                        ? resolved.before(1)
                                        : resolved.after(1)
                                    : target.pos;
                            const first = members[0]!.at;
                            const end = members[members.length - 1]!.end;
                            if (destination >= first && destination <= end)
                                return true;
                            const content = view.state.doc.slice(
                                first,
                                end,
                            ).content;
                            const transaction = view.state.tr.delete(
                                first,
                                end,
                            );
                            transaction.insert(
                                transaction.mapping.map(destination),
                                content,
                            );
                            normalizeEditorDocument(transaction.doc.toJSON());
                            view.dispatch(transaction);
                            view.dragging = null;
                        } catch {
                            /* Invalid or stale drag payload leaves the document unchanged. */
                        }
                        return true;
                    },
                },
            }),
        ];
    },
});
