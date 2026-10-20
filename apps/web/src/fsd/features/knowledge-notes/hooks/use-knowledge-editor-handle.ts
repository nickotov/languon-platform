import { useImperativeHandle, type ForwardedRef, type RefObject } from 'react';
import type { Editor } from '@tiptap/react';
import { type KnowledgeEditorTarget } from '../lib/proposal-target';
import {
    editorPlainOffset,
    editorPlainText,
    hashEditorText,
    restoreEditorPositions,
} from '../lib/editor-target-anchor';
import { inlineProposalPosition } from '../lib/inline-proposal-position';
import type { KnowledgeEditorHandle } from '../ui/knowledge-editor/knowledge-editor';

export function useKnowledgeEditorHandle(
    editor: Editor | null,
    disabled: boolean,
    ref: ForwardedRef<KnowledgeEditorHandle>,
    targets: RefObject<Map<string, KnowledgeEditorTarget>>,
) {
    useImperativeHandle(
        ref,
        () => ({
            getSnapshot(capturedTargetId) {
                if (!editor)
                    throw new Error('The document editor is still loading.');
                const suppliedTarget = typeof capturedTargetId === 'string';
                let target = suppliedTarget
                    ? targets.current.get(capturedTargetId)
                    : undefined;
                if (suppliedTarget && !target)
                    throw new Error(
                        'The selected document passage is no longer available. Select it again.',
                    );
                if (!target) {
                    const selection = editor.state.selection;
                    const from =
                        capturedTargetId === null
                            ? selection.to
                            : selection.from;
                    const to = selection.to;
                    const id = crypto.randomUUID();
                    target = {
                        id,
                        from,
                        to,
                        selectedText: editor.state.doc.textBetween(
                            from,
                            to,
                            '\n',
                            '\n',
                        ),
                        changed: false,
                    };
                    targets.current.set(id, target);
                }
                const max = editor.state.doc.content.size;
                const from = Math.min(target.from, target.to, max);
                const to = Math.min(Math.max(target.from, target.to), max);
                const selectedText = target.selectedText;
                const targetId = target.id;
                const content = editorPlainText(editor.state.doc);
                const plainFrom = editorPlainOffset(editor.state.doc, from);
                const plainTo = editorPlainOffset(editor.state.doc, to);
                return {
                    content,
                    ...(selectedText ? { selectedPassage: selectedText } : {}),
                    targetId,
                    editorTarget: {
                        from: plainFrom,
                        to: plainTo,
                        originalText: content.slice(plainFrom, plainTo),
                    },
                };
            },
            async restoreTarget(anchor) {
                if (!editor) return null;
                const doc = editor.state.doc;
                const content = editorPlainText(doc);
                if ((await hashEditorText(content)) !== anchor.documentHash)
                    return null;
                if (editor.state.doc !== doc) return null;
                const positions = restoreEditorPositions(doc, anchor);
                if (!positions) return null;
                const targetId = crypto.randomUUID();
                targets.current.set(targetId, {
                    id: targetId,
                    ...positions,
                    selectedText: anchor.originalText,
                    changed: false,
                });
                return targetId;
            },
            applyProposal(text, action, targetId) {
                if (!editor || disabled) return 'missing';
                let from = editor.state.doc.content.size;
                let to = from;
                if (action !== 'append') {
                    const target = targetId
                        ? targets.current.get(targetId)
                        : null;
                    if (!target) return 'missing';
                    if (target.changed) return 'changed';
                    if (action === 'replace' && target.from === target.to)
                        return 'missing';
                    if (
                        target.from > editor.state.doc.content.size ||
                        target.to > editor.state.doc.content.size ||
                        target.from > target.to
                    )
                        return 'missing';
                    const current = editor.state.doc.textBetween(
                        target.from,
                        target.to,
                        '\n',
                        '\n',
                    );
                    if (current !== target.selectedText) return 'changed';
                    from = target.from;
                    to = action === 'replace' ? target.to : target.from;
                }
                const content = text.split('\n').map((line) => ({
                    type: 'paragraph',
                    ...(line
                        ? { content: [{ type: 'text', text: line }] }
                        : {}),
                }));
                const applied = editor
                    .chain()
                    .focus()
                    .insertContentAt({ from, to }, content)
                    .run();
                if (!applied) return 'missing';
                if (targetId) targets.current.delete(targetId);
                return 'applied';
            },
            getProposalPreview(targetId) {
                if (!editor) return null;
                const doc = editor.state.doc;
                const target = targetId ? targets.current.get(targetId) : null;
                if (!target) {
                    if (targetId) return null;
                    return {
                        original: '',
                        current: '',
                        before: '',
                        after: '',
                        end: editorPlainText(doc).slice(-240),
                        changed: false,
                    };
                }
                const from = Math.min(target.from, target.to, doc.content.size);
                const to = Math.min(
                    Math.max(target.from, target.to),
                    doc.content.size,
                );
                const current = doc.textBetween(from, to, '\n', '\n');
                return {
                    original: target.selectedText,
                    current,
                    before: doc.textBetween(
                        Math.max(0, from - 180),
                        from,
                        '\n',
                        '\n',
                    ),
                    after: doc.textBetween(
                        to,
                        Math.min(doc.content.size, to + 180),
                        '\n',
                        '\n',
                    ),
                    end: editorPlainText(doc).slice(-240),
                    changed: target.changed || current !== target.selectedText,
                };
            },
            getProposalPosition(targetId) {
                const target = targets.current.get(targetId);
                if (!editor || !target || target.changed) return null;
                const root = editor.view.dom.closest<HTMLElement>(
                    '[data-workspace-editor]',
                );
                if (!root) return null;
                if (target.to > editor.state.doc.content.size) return null;
                const current = editor.state.doc.textBetween(
                    target.from,
                    target.to,
                    '\n',
                    '\n',
                );
                if (current !== target.selectedText) return null;
                const bounds = root.getBoundingClientRect();
                const range = document.createRange();
                const start = editor.view.domAtPos(target.from);
                const end = editor.view.domAtPos(target.to);
                range.setStart(start.node, start.offset);
                range.setEnd(end.node, end.offset);
                const rects = range.getClientRects();
                const last =
                    rects.item?.(rects.length - 1) ??
                    rects[rects.length - 1] ??
                    editor.view.coordsAtPos(target.to);
                const fontSize =
                    parseFloat(
                        getComputedStyle(document.documentElement).fontSize,
                    ) || 16;
                return inlineProposalPosition(bounds, last, fontSize);
            },
            showTarget(targetId) {
                const target = targets.current.get(targetId);
                if (!editor || !target) return;
                const max = editor.state.doc.content.size;
                const from = Math.min(target.from, target.to, max);
                const to = Math.min(Math.max(target.from, target.to), max);
                editor
                    .chain()
                    .focus()
                    .setTextSelection({ from, to })
                    .scrollIntoView()
                    .run();
            },
            getTargetComparison(targetId) {
                const target = targetId ? targets.current.get(targetId) : null;
                if (!editor || !target) return null;
                const from = Math.min(
                    target.from,
                    target.to,
                    editor.state.doc.content.size,
                );
                const to = Math.min(
                    Math.max(target.from, target.to),
                    editor.state.doc.content.size,
                );
                const current = editor.state.doc.textBetween(
                    from,
                    to,
                    '\n',
                    '\n',
                );
                return { original: target.selectedText, current };
            },
        }),
        [editor, disabled],
    );
}
