import { useLayoutEffect, type RefObject } from 'react';

export function useTooltipTopLayer(
    panelRef: RefObject<HTMLDivElement | null>,
    visible: boolean,
) {
    useLayoutEffect(() => {
        const panel = panelRef.current;
        if (!panel || !visible || typeof panel.showPopover !== 'function')
            return;
        return () => panel.hidePopover();
    }, [panelRef, visible]);
}
