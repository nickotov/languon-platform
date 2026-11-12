'use client';

import {
    cloneElement,
    forwardRef,
    isValidElement,
    type ReactElement,
    type Ref,
    useLayoutEffect,
} from 'react';
import { usePopover } from '../../../popover-context';
import { assignRef } from '../../../popover-helpers';
import type { PopoverAnchorProps } from '../types';

export const PopoverAnchor = forwardRef<HTMLElement, PopoverAnchorProps>(
    function PopoverAnchor(
        { asChild = false, children, className, virtualRef, ...props },
        forwardedRef,
    ) {
        const context = usePopover();
        const { setVirtualReference } = context;
        useLayoutEffect(() => {
            setVirtualReference(virtualRef);

            return () => setVirtualReference(undefined);
        }, [setVirtualReference, virtualRef]);

        const setRef = (node: HTMLElement | null) => {
            context.triggerRef.current = node;

            if (typeof forwardedRef === 'function') {
                forwardedRef(node);
            } else if (forwardedRef) {
                forwardedRef.current = node;
            }
        };

        if (asChild && isValidElement(children)) {
            const child = children as ReactElement<{
                className?: string;
                ref?: Ref<HTMLElement>;
            }>;

            return cloneElement(child, {
                ...props,
                className: [child.props.className, className]
                    .filter(Boolean)
                    .join(' '),
                ref: (node) => {
                    assignRef(child.props.ref, node);

                    setRef(node);
                },
            });
        }

        return (
            <span {...props} className={className} ref={setRef}>
                {children}
            </span>
        );
    },
);
