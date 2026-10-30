import type { Node as DocumentNode } from '@tiptap/pm/model';
import { NodeSelection, type PluginView } from '@tiptap/pm/state';
import type { EditorView } from '@tiptap/pm/view';
import { adjacentBlockDestination } from '../../lib/editor-block-range';
import { moveEditorBlock } from '../../lib/move-editor-block';
import styles from './prose-block-drag.module.css';

type ActiveBlock = {
    position: number;
    node: DocumentNode;
    element: HTMLElement;
};
export type ProseDragState = {
    current: { document: DocumentNode; source: ActiveBlock } | null;
};

export function createProseBlockDragView(
    view: EditorView,
    label: (node: DocumentNode) => string,
    dragState: ProseDragState,
): PluginView {
    const host = view.dom.parentElement!;
    const handle = createHandle();
    // Shift+Tab from the prose reaches its handle without traversing embedded
    // players and custom-block controls inside the contenteditable element.
    host.insertBefore(handle, view.dom);
    let active: ActiveBlock | null = null;
    function hide() {
        active = null;
        handle.hidden = true;
    }
    function inHoverCorridor(event: MouseEvent) {
        if (!active) return false;
        const block = active.element.getBoundingClientRect();
        const grip = handle.getBoundingClientRect();
        return (
            event.clientX >= Math.min(block.left, grip.left) &&
            event.clientX <= Math.max(block.right, grip.right) &&
            event.clientY >= Math.min(block.top, grip.top) &&
            event.clientY <= Math.max(block.bottom, grip.bottom)
        );
    }
    function leaveCorridor(event: MouseEvent) {
        if (!active || dragState.current) return;
        if (
            event.target instanceof globalThis.Node &&
            (view.dom.contains(event.target) || handle.contains(event.target))
        )
            return;
        if (!inHoverCorridor(event)) hide();
    }
    function position() {
        if (!active || !view.editable) return hide();
        const nodeRect = active.element.getBoundingClientRect();
        const hostRect = host.getBoundingClientRect();
        handle.style.top = `${nodeRect.top - hostRect.top + host.scrollTop}px`;
        handle.style.left = `${nodeRect.left - hostRect.left + host.scrollLeft}px`;
    }
    function show(at: number, element: HTMLElement) {
        const node = view.state.doc.nodeAt(at);
        if (
            !view.editable ||
            !node ||
            node.type.name === 'learningBlock' ||
            !NodeSelection.isSelectable(node)
        )
            return hide();
        active = { position: at, node, element };
        handle.setAttribute('aria-label', label(node));
        handle.title = label(node);
        handle.hidden = false;
        position();
    }
    function followSelection(event?: Event) {
        if (
            event?.target instanceof HTMLElement &&
            event.target.closest('[data-learning-block-id]')
        )
            return hide();
        if (dragState.current || !view.editable) return;
        const resolved = view.state.doc.resolve(view.state.selection.from);
        const at = resolved.depth ? resolved.before(1) : resolved.pos;
        const element = view.nodeDOM(at);
        if (element instanceof HTMLElement) show(at, element);
    }
    function hover(event: MouseEvent) {
        if (dragState.current) return;
        if (!view.editable || !(event.target instanceof HTMLElement))
            return hide();
        let element = event.target;
        while (element.parentElement && element.parentElement !== view.dom)
            element = element.parentElement;
        if (element.parentElement !== view.dom) {
            if (!inHoverCorridor(event)) hide();
            return;
        }
        if (element === active?.element) return;
        const inside = view.state.doc.resolve(view.posAtDOM(element, 0));
        const at = inside.depth ? inside.before(1) : inside.pos;
        show(at, element);
    }
    function select() {
        if (!active || !view.editable) return;
        view.dispatch(
            view.state.tr.setSelection(
                NodeSelection.create(view.state.doc, active.position),
            ),
        );
    }
    function drag(event: DragEvent) {
        if (!active || !view.editable || !event.dataTransfer) {
            event.preventDefault();
            return;
        }
        select();
        const slice = view.state.selection.content();
        const serialized = view.serializeForClipboard(slice);
        event.dataTransfer.clearData();
        event.dataTransfer.setData('text/html', serialized.dom.innerHTML);
        event.dataTransfer.setData('text/plain', serialized.text);
        event.dataTransfer.effectAllowed = 'copyMove';
        event.dataTransfer.setDragImage(active.element, 0, 0);
        view.dragging = { slice: serialized.slice, move: true };
        dragState.current = {
            document: view.state.doc,
            source: active,
        };
    }
    function endDrag() {
        dragState.current = null;
        view.dragging = null;
    }
    function keyboard(event: KeyboardEvent) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            select();
        }
        if (
            event.altKey &&
            (event.key === 'ArrowUp' || event.key === 'ArrowDown') &&
            active
        ) {
            event.preventDefault();
            const destination = adjacentBlockDestination(
                view.state.doc,
                active.position,
                event.key === 'ArrowUp' ? -1 : 1,
            );
            if (destination !== null)
                moveEditorBlock(view, active, destination);
        }
    }
    view.dom.addEventListener('mousemove', hover);
    view.dom.addEventListener('pointerdown', hover);
    view.dom.addEventListener('focusin', followSelection);
    view.dom.addEventListener('keyup', followSelection);
    document.addEventListener('mousemove', leaveCorridor);
    host.addEventListener('scroll', position, true);
    window.addEventListener('resize', position);
    handle.addEventListener('click', select);
    handle.addEventListener('keydown', keyboard);
    handle.addEventListener('dragstart', drag);
    handle.addEventListener('dragend', endDrag);
    return {
        update(current, previous) {
            const documentChanged = current.state.doc !== previous.doc;
            const selectionChanged = !current.state.selection.eq(
                previous.selection,
            );
            if (documentChanged || !current.editable) hide();
            else position();
            // Status/options updates must not replace a hovered block with the
            // block containing the unchanged text caret while crossing the gap.
            if (current.hasFocus() && (documentChanged || selectionChanged))
                followSelection();
        },
        destroy() {
            view.dom.removeEventListener('mousemove', hover);
            view.dom.removeEventListener('pointerdown', hover);
            view.dom.removeEventListener('focusin', followSelection);
            view.dom.removeEventListener('keyup', followSelection);
            document.removeEventListener('mousemove', leaveCorridor);
            host.removeEventListener('scroll', position, true);
            window.removeEventListener('resize', position);
            handle.remove();
        },
    };
}

function createHandle() {
    const handle = document.createElement('div');
    handle.className = styles.handle!;
    handle.setAttribute('role', 'button');
    handle.setAttribute('contenteditable', 'false');
    handle.tabIndex = 0;
    handle.draggable = true;
    handle.hidden = true;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    for (const x of [9, 15])
        for (const y of [5, 12, 19]) {
            const circle = document.createElementNS(svg.namespaceURI, 'circle');
            circle.setAttribute('cx', String(x));
            circle.setAttribute('cy', String(y));
            circle.setAttribute('r', '1');
            svg.append(circle);
        }
    handle.append(svg);
    return handle;
}
