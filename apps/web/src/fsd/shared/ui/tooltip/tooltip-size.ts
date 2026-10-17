import { size } from '@floating-ui/react';

export function tooltipViewportSize(view: Window) {
    return {
        width: Math.max(
            0,
            (view.visualViewport?.width ?? view.innerWidth) - 32,
        ),
        height: Math.max(
            0,
            (view.visualViewport?.height ?? view.innerHeight) - 32,
        ),
    };
}

export function tooltipSize() {
    return size({
        padding: 16,
        apply({ elements }) {
            const view = elements.floating.ownerDocument.defaultView;
            if (!view) return;
            // A closed native popover first measures zero. A side-specific cap
            // can lock that initial placement into a clipped, tiny tooltip.
            const viewport = tooltipViewportSize(view);
            elements.floating.style.setProperty(
                '--tooltip-available-height',
                `${viewport.height}px`,
            );
            Object.assign(elements.floating.style, {
                maxWidth: `${Math.min(280, viewport.width)}px`,
                maxHeight: `${viewport.height}px`,
            });
        },
    });
}
