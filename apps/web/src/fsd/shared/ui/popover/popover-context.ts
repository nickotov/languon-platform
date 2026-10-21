import {
    createContext,
    useContext,
    type CSSProperties,
    type MutableRefObject,
} from 'react';
import type { Placement, VirtualElement } from '@floating-ui/react';

type PopoverContextValue = {
    anchorElement: Element | null;
    contentId: string;
    contentRef: MutableRefObject<HTMLDivElement | null>;
    floatingStyles: CSSProperties;
    isPositioned: boolean;
    open: boolean;
    nestedPanels: Set<MutableRefObject<HTMLDivElement | null>>;
    registerNested(panel: MutableRefObject<HTMLDivElement | null>): () => void;
    setOpen(open: boolean): void;
    setPosition(placement: Placement, sideOffset: number): void;
    setFloating(node: HTMLDivElement | null): void;
    setVirtualReference(reference: VirtualElement | undefined): void;
    triggerRef: MutableRefObject<HTMLElement | null>;
};

export const PopoverContext = createContext<PopoverContextValue | null>(null);

export function usePopover() {
    const context = useContext(PopoverContext);
    if (!context) throw new Error('Popover parts must be used within Popover');
    return context;
}
