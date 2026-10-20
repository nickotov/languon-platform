import { expect, it } from 'vitest';
import { selectionBubblePosition } from '../src/fsd/features/knowledge-notes/lib/selection-bubble-position';

const viewport = { top: 100, bottom: 600, left: 0, right: 700 };
const root = { top: 140, bottom: 1200, left: 50, right: 650 };
const bubble = { width: 400, height: 42 };

it('flips below a passage near the visible scroller top and keeps the full bubble inside', () => {
    const result = selectionBubblePosition({
        root,
        viewport,
        bubble,
        touch: false,
        selection: { top: 110, bottom: 130, left: 70, right: 190 },
    });
    expect(result).toEqual({ left: 0, top: 0, visible: true });
    expect(root.top + result.top).toBeGreaterThanOrEqual(130);
});

it('keeps the bubble above when below would extend past the scroller bottom', () => {
    const result = selectionBubblePosition({
        root,
        viewport,
        bubble,
        touch: true,
        selection: { top: 560, bottom: 580, left: 500, right: 640 },
    });
    expect(result).toEqual({ left: 200, top: 368, visible: true });
    expect(root.left + result.left + bubble.width).toBeLessThanOrEqual(
        root.right,
    );
    expect(root.top + result.top + bubble.height).toBeLessThan(560);
});

it('repositions against the visible viewport when the selected content is scrolled upward', () => {
    const selection = { top: 350, bottom: 370, left: 100, right: 200 };
    const initial = selectionBubblePosition({
        root,
        viewport,
        bubble,
        touch: false,
        selection,
    });
    const shifted = selectionBubblePosition({
        root: { ...root, top: root.top - 240 },
        viewport,
        bubble,
        touch: false,
        selection: { ...selection, top: 110, bottom: 130 },
    });
    expect(initial.top).toBe(158);
    expect(shifted.top).toBe(240);
    expect(shifted.visible).toBe(true);
});

it('hides a selection toolbar only once its passage is outside the visible viewport', () => {
    expect(
        selectionBubblePosition({
            root,
            viewport,
            bubble,
            touch: false,
            selection: { top: 40, bottom: 60, left: 100, right: 200 },
        }).visible,
    ).toBe(false);
});
