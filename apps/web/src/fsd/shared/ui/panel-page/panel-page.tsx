'use client';

import { ArrowLeft } from 'lucide-react';
import {
    useId,
    useLayoutEffect,
    useRef,
    type KeyboardEvent,
    type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { usePanelOutlet } from '../panel-page-host/panel-page-host';
import { Button } from '../button/button';
import styles from './panel-page.module.css';

export function PanelPage({
    title,
    backLabel,
    onBack,
    children,
    footer,
}: {
    title: string;
    backLabel: string;
    onBack(): void;
    children: ReactNode;
    footer?: ReactNode;
}) {
    const outlet = usePanelOutlet();
    const titleId = useId();
    const heading = useRef<HTMLHeadingElement>(null);
    useLayoutEffect(() => {
        heading.current?.focus({ preventScroll: true });
    }, [outlet]);

    function back() {
        onBack();
        outlet?.restoreOpener();
    }

    function handleKey(event: KeyboardEvent<HTMLElement>) {
        if (event.key === 'Escape' && !event.defaultPrevented) {
            event.preventDefault();
            event.stopPropagation();
            back();
        }
    }

    const page = (
        <section
            data-panel-overlay-root
            className={styles.page}
            aria-labelledby={titleId}
            onKeyDown={handleKey}
        >
            <header className={styles.header}>
                <Button
                    variant='ghost'
                    size='compact'
                    onClick={back}
                    leadingIcon={<ArrowLeft size={16} aria-hidden />}
                >
                    {backLabel}
                </Button>
                <h2 ref={heading} tabIndex={-1} id={titleId}>
                    {title}
                </h2>
            </header>
            <div className={styles.body}>{children}</div>
            {footer && <footer className={styles.footer}>{footer}</footer>}
        </section>
    );

    return outlet?.element ? createPortal(page, outlet.element) : page;
}
