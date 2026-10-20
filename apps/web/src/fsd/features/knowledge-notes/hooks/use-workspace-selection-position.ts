import { useLayoutEffect, type RefObject } from 'react';
import type { Editor } from '@tiptap/react';
import { selectionBubblePosition } from '../lib/selection-bubble-position';

/** Geometry is an overlay concern; moving it must not alter the editor selection. */
export function useWorkspaceSelectionPosition(
    editor: Editor,
    ref: RefObject<HTMLDivElement | null>,
    more: boolean,
) {
    useLayoutEffect(() => {
        const bubble = ref.current;
        const root = bubble?.parentElement;
        if (!bubble || !root) return;
        const scroll = root.closest<HTMLElement>('[data-workspace-scroll]');
        function position() {
            if (!bubble || !root || editor.isDestroyed) return;
            const selection = editor.state.selection;
            const start = editor.view.coordsAtPos(selection.from);
            const end = editor.view.coordsAtPos(selection.to);
            const bounds = root.getBoundingClientRect();
            const visible = scroll?.getBoundingClientRect();
            const viewport = {
                top: Math.max(0, visible?.top ?? 0),
                bottom: Math.min(
                    window.innerHeight,
                    visible?.bottom ?? window.innerHeight,
                ),
                left: Math.max(0, visible?.left ?? 0),
                right: Math.min(
                    window.innerWidth,
                    visible?.right ?? window.innerWidth,
                ),
            };
            const result = selectionBubblePosition({
                root: bounds,
                viewport,
                selection: {
                    top: Math.min(start.top, end.top),
                    bottom: Math.max(start.bottom, end.bottom),
                    left: start.left,
                    right: end.right,
                },
                bubble: bubble.getBoundingClientRect(),
                touch: window.matchMedia(
                    '(max-width: 767px), (pointer: coarse)',
                ).matches,
            });
            bubble.style.left = `${result.left}px`;
            bubble.style.top = `${result.top}px`;
            bubble.style.visibility = result.visible ? 'visible' : 'hidden';
        }
        position();
        scroll?.addEventListener('scroll', position, { passive: true });
        window.addEventListener('resize', position);
        editor.on('selectionUpdate', position);
        editor.on('update', position);
        const observer =
            typeof ResizeObserver === 'undefined'
                ? null
                : new ResizeObserver(position);
        observer?.observe(root);
        observer?.observe(bubble);
        return () => {
            scroll?.removeEventListener('scroll', position);
            window.removeEventListener('resize', position);
            editor.off('selectionUpdate', position);
            editor.off('update', position);
            observer?.disconnect();
        };
    }, [editor, ref, more]);
}
