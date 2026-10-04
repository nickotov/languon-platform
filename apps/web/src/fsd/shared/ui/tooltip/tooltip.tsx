'use client';

import {
    arrow as floatingArrow,
    autoUpdate,
    flip,
    offset,
    type Placement,
    shift,
    useFloating,
} from '@floating-ui/react';
import {
    cloneElement,
    type CSSProperties,
    type FocusEvent,
    type KeyboardEvent,
    type ReactElement,
    type ReactNode,
    useEffect,
    useId,
    useRef,
    useState,
} from 'react';
import { createPortal } from 'react-dom';

import styles from './tooltip.module.css';

type TriggerProps = {
    'aria-describedby'?: string;
    onBlur?(event: FocusEvent): void;
    onFocus?(event: FocusEvent): void;
    onKeyDown?(event: KeyboardEvent): void;
};

export type TooltipProps = {
    children: ReactElement<TriggerProps>;
    className?: string;
    content: ReactNode;
    delay?: number;
    disabled?: boolean;
    open?: boolean;
    placement?: Placement;
    withArrow?: boolean;
};

const ARROW_OFFSET = -4;

const oppositeSide = {
    bottom: 'top',
    left: 'right',
    right: 'left',
    top: 'bottom',
} as const;

function arrowStyle(
    placement: Placement,
    x: number | undefined,
    y: number | undefined,
): CSSProperties {
    const side = placement.split('-')[0] as keyof typeof oppositeSide;

    return {
        left: x,
        top: y,
        [oppositeSide[side]]: ARROW_OFFSET,
    };
}

export function Tooltip({
    children,
    className,
    content,
    delay = 500,
    disabled = false,
    open: forcedOpen,
    placement = 'top',
    withArrow = true,
}: TooltipProps) {
    const id = useId();

    const arrowRef = useRef<HTMLSpanElement | null>(null);

    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

    const [mounted, setMounted] = useState(false);

    const [open, setOpen] = useState(false);

    const visible = forcedOpen ?? open;

    const {
        floatingStyles,
        middlewareData,
        placement: resolvedPlacement,
        refs,
    } = useFloating({
        middleware: [
            offset(8),
            flip({ padding: 16 }),
            shift({ padding: 16 }),
            floatingArrow({ element: arrowRef }),
        ],
        onOpenChange: setOpen,
        open: visible,
        placement,
        strategy: 'fixed',
        whileElementsMounted: visible ? autoUpdate : undefined,
    });

    const isPointerControlled = forcedOpen !== undefined;

    const tooltipClassName = [styles.tooltip, className]
        .filter(Boolean)
        .join(' ');

    const tooltipArrowStyle = arrowStyle(
        resolvedPlacement,
        middlewareData.arrow?.x,
        middlewareData.arrow?.y,
    );

    useEffect(() => {
        setMounted(true);

        return () => {
            if (timer.current) clearTimeout(timer.current);
        };
    }, []);

    useEffect(() => {
        if (!visible) return;

        function dismissWithEscape(event: globalThis.KeyboardEvent) {
            if (event.key !== 'Escape') return;

            if (timer.current) clearTimeout(timer.current);

            setOpen(false);
        }

        document.addEventListener('keydown', dismissWithEscape);

        return () => document.removeEventListener('keydown', dismissWithEscape);
    }, [visible]);

    function setPanel(node: HTMLDivElement | null) {
        refs.setFloating(node);
    }

    function show() {
        if (timer.current) clearTimeout(timer.current);

        setOpen(true);
    }

    function showAfterDelay() {
        if (timer.current) clearTimeout(timer.current);

        timer.current = setTimeout(show, delay);
    }

    function hide() {
        if (timer.current) clearTimeout(timer.current);

        setOpen(false);
    }

    if (disabled || !content) return children;

    function resolveDescribedBy() {
        if (visible) {
            return [children.props['aria-describedby'], id]
                .filter(Boolean)
                .join(' ');
        }

        return children.props['aria-describedby'];
    }

    const describedBy = resolveDescribedBy();

    const triggerProps: Partial<TriggerProps> = {
        onBlur(event: FocusEvent) {
            children.props.onBlur?.(event);

            hide();
        },
        onFocus(event: FocusEvent) {
            children.props.onFocus?.(event);

            show();
        },
        onKeyDown(event: KeyboardEvent) {
            children.props.onKeyDown?.(event);

            if (event.key === 'Escape') hide();
        },
    };

    if (describedBy) triggerProps['aria-describedby'] = describedBy;

    const trigger = cloneElement(children, triggerProps);

    const pointerEnterHandler = isPointerControlled
        ? undefined
        : showAfterDelay;

    const pointerLeaveHandler = isPointerControlled ? undefined : hide;

    return (
        <span
            className={styles.root}
            onMouseEnter={pointerEnterHandler}
            onMouseLeave={pointerLeaveHandler}
            ref={refs.setReference}
        >
            {trigger}
            {mounted &&
                createPortal(
                    <div
                        className={tooltipClassName}
                        data-placement={resolvedPlacement}
                        hidden={!visible}
                        id={id}
                        ref={setPanel}
                        role='tooltip'
                        style={floatingStyles}
                    >
                        {content}
                        {withArrow && (
                            <span
                                aria-hidden='true'
                                className={styles.arrow}
                                ref={arrowRef}
                                style={tooltipArrowStyle}
                            />
                        )}
                    </div>,
                    document.body,
                )}
        </span>
    );
}
