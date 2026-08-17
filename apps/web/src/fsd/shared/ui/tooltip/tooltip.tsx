'use client';

import {
    cloneElement,
    type FocusEvent,
    type KeyboardEvent,
    type ReactElement,
    type ReactNode,
    useEffect,
    useId,
    useRef,
    useState,
} from 'react';

import styles from './tooltip.module.css';

type TriggerProps = {
    'aria-describedby'?: string;
    onBlur?(event: FocusEvent): void;
    onFocus?(event: FocusEvent): void;
    onKeyDown?(event: KeyboardEvent): void;
};

export function Tooltip({
    children,
    content,
}: {
    children: ReactElement<TriggerProps>;
    content: ReactNode;
}) {
    const id = useId();
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const [open, setOpen] = useState(false);

    useEffect(
        () => () => {
            if (timer.current) clearTimeout(timer.current);
        },
        [],
    );

    function showAfterDelay() {
        timer.current = setTimeout(() => setOpen(true), 500);
    }

    function hide() {
        if (timer.current) clearTimeout(timer.current);
        setOpen(false);
    }

    const describedBy = open
        ? [children.props['aria-describedby'], id].filter(Boolean).join(' ')
        : children.props['aria-describedby'];
    const triggerProps: Partial<TriggerProps> = {
        onBlur(event: FocusEvent) {
            children.props.onBlur?.(event);
            hide();
        },
        onFocus(event: FocusEvent) {
            children.props.onFocus?.(event);
            setOpen(true);
        },
        onKeyDown(event: KeyboardEvent) {
            children.props.onKeyDown?.(event);
            if (event.key === 'Escape') hide();
        },
    };
    if (describedBy) triggerProps['aria-describedby'] = describedBy;
    const trigger = cloneElement(children, triggerProps);

    return (
        <span
            className={styles.root}
            onMouseEnter={showAfterDelay}
            onMouseLeave={hide}
        >
            {trigger}
            <span
                className={styles.tooltip}
                hidden={!open}
                id={id}
                onMouseEnter={() => setOpen(true)}
                role='tooltip'
            >
                {content}
            </span>
        </span>
    );
}
