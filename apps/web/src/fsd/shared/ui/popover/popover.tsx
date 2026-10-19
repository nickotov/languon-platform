'use client';

import {
    autoUpdate,
    flip,
    offset,
    shift,
    size,
    useFloating,
    type Placement,
    type VirtualElement,
} from '@floating-ui/react';
import {
    useCallback,
    useEffect,
    useId,
    useRef,
    useState,
    type ReactNode,
} from 'react';
import { PopoverContext } from './popover-context';

export * from './popover-parts';
export * from './popover-accessories';
export { PopoverContent, type PopoverContentProps } from './popover-content';

export type PopoverRootProps = {
    children: ReactNode;
    defaultOpen?: boolean;
    onOpenChange?: (open: boolean) => void;
    open?: boolean;
};

export function Popover({
    children,
    defaultOpen = false,
    onOpenChange,
    open: controlledOpen,
}: PopoverRootProps) {
    const [internalOpen, setInternalOpen] = useState(defaultOpen);
    const [placement, setPlacement] = useState<Placement>('bottom');
    const [sideOffset, setSideOffset] = useState(8);
    const open = controlledOpen ?? internalOpen;
    const triggerRef = useRef<HTMLElement | null>(null);
    const contentRef = useRef<HTMLDivElement | null>(null);
    const contentId = useId();
    const [virtualReference, setVirtualReference] = useState<
        VirtualElement | undefined
    >();

    const { floatingStyles, refs, isPositioned } = useFloating({
        middleware: [
            offset(sideOffset),
            flip({ padding: 16 }),
            shift({ padding: 16 }),
            size({
                padding: 16,
                apply({ availableWidth, availableHeight, elements, rects }) {
                    elements.floating.style.setProperty(
                        '--popover-anchor-width',
                        `${rects.reference.width}px`,
                    );
                    Object.assign(elements.floating.style, {
                        maxWidth: `${Math.max(0, availableWidth)}px`,
                        maxHeight: `${Math.max(0, availableHeight)}px`,
                    });
                },
            }),
        ],
        open,
        placement,
        strategy: 'fixed',
        whileElementsMounted: open ? autoUpdate : undefined,
    });

    const setOpen = useCallback(
        (next: boolean) => {
            if (controlledOpen === undefined) setInternalOpen(next);
            onOpenChange?.(next);
        },
        [controlledOpen, onOpenChange],
    );

    const setPosition = useCallback(
        (nextPlacement: Placement, nextOffset: number) => {
            setPlacement(nextPlacement);
            setSideOffset(nextOffset);
        },
        [],
    );

    useEffect(() => {
        refs.setReference(triggerRef.current);
        refs.setPositionReference(virtualReference ?? triggerRef.current);
        refs.setFloating(contentRef.current);
    }, [open, refs, virtualReference]);

    return (
        <PopoverContext.Provider
            value={{
                anchorElement:
                    virtualReference?.contextElement ?? triggerRef.current,
                contentId,
                contentRef,
                floatingStyles,
                isPositioned,
                open,
                setOpen,
                setPosition,
                triggerRef,
                setVirtualReference,
                setFloating: refs.setFloating,
            }}
        >
            {children}
        </PopoverContext.Provider>
    );
}
