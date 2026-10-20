type Bounds = { top: number; bottom: number; left: number; right: number };

/** Place the overlay in the visible editor viewport, including after scrolling. */
export function selectionBubblePosition({
    root,
    viewport,
    selection,
    bubble,
    touch,
}: {
    root: Bounds;
    viewport: Bounds;
    selection: Bounds;
    bubble: { width: number; height: number };
    touch: boolean;
}): { left: number; top: number; visible: boolean } {
    const gap = 10;
    const edge = 4;
    const topEdge = viewport.top + edge;
    const bottomEdge = viewport.bottom - bubble.height - edge;
    const availableLeft = Math.max(root.left, viewport.left);
    const availableRight = Math.min(root.right, viewport.right) - bubble.width;
    const centered = (selection.left + selection.right - bubble.width) / 2;
    const left = Math.max(availableLeft, Math.min(centered, availableRight));
    const above = selection.top - bubble.height - gap;
    const below = selection.bottom + gap;
    let top = above;
    if (touch || above < topEdge) top = below;
    if (top > bottomEdge && above >= topEdge) top = above;
    top = Math.max(topEdge, Math.min(top, bottomEdge));
    return {
        left: left - root.left,
        top: top - root.top,
        visible:
            selection.bottom >= viewport.top &&
            selection.top <= viewport.bottom,
    };
}
