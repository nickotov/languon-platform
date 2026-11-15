'use client';

import {
    useEffect,
    useRef,
    type ChangeEvent,
    type KeyboardEvent,
    type ReactNode,
} from 'react';
import { ArrowLeft, Search, X } from 'lucide-react';
import { Input } from '../input/input';
import { commandMenuKey } from './command-menu-key';
import styles from './command-menu.module.css';

export type CommandMenuProps = {
    title: string;
    closeLabel: string;
    onClose(): void;
    backLabel?: string | undefined;
    onBack?: (() => void) | undefined;
    searchLabel?: string | undefined;
    query?: string | undefined;
    onQueryChange?: ((value: string) => void) | undefined;
    autoFocusSearch?: boolean | undefined;
    onResumeTyping?: ((text: string) => void) | undefined;
    children: ReactNode;
    hint?: ReactNode;
    className?: string | undefined;
};

/** Shared visual chrome; action identity and nested navigation stay with the caller. */
export function CommandMenu({
    title,
    closeLabel,
    onClose,
    backLabel,
    onBack,
    searchLabel,
    query = '',
    onQueryChange,
    autoFocusSearch = false,
    onResumeTyping,
    children,
    hint,
    className,
}: CommandMenuProps) {
    const rootRef = useRef<HTMLDivElement>(null);
    const searchRef = useRef<HTMLInputElement>(null);
    useEffect(() => {
        if (!autoFocusSearch || !searchLabel) {
            return;
        }

        const input = searchRef.current;
        const panel =
            rootRef.current?.closest('[popover], [role="dialog"]') ??
            rootRef.current;

        if (!input || !panel) {
            return;
        }

        function focusSearch() {
            if (
                !input ||
                input.closest('[hidden]') ||
                getComputedStyle(input).visibility === 'hidden'
            ) {
                return false;
            }

            input.focus({ preventScroll: true });

            return document.activeElement === input;
        }

        if (focusSearch()) {
            return;
        }

        // Floating surfaces start hidden until positioned; focus only after that transition.
        const observer = new MutationObserver(() => {
            if (focusSearch()) {
                observer.disconnect();
            }
        });

        observer.observe(panel, { attributes: true });
        const frame = requestAnimationFrame(() => {
            if (focusSearch()) {
                observer.disconnect();
            }
        });

        return () => {
            observer.disconnect();
            cancelAnimationFrame(frame);
        };
    }, [autoFocusSearch, searchLabel, title]);

    function search(event: ChangeEvent<HTMLInputElement>) {
        onQueryChange?.(event.target.value);
    }

    function keyboard(event: KeyboardEvent<HTMLDivElement>) {
        commandMenuKey(event, { onBack, onClose, onResumeTyping });
    }

    const classes = [styles.root, className].filter(Boolean).join(' ');

    return (
        <div
            ref={rootRef}
            className={classes}
            data-command-menu
            onKeyDown={keyboard}
        >
            <div className={styles.header}>
                {onBack && (
                    <button
                        type='button'
                        className={styles.utility}
                        onClick={onBack}
                        aria-label={backLabel}
                        title={backLabel}
                    >
                        <ArrowLeft size={16} aria-hidden='true' />
                    </button>
                )}
                <span className={styles.title}>{title}</span>
                <button
                    type='button'
                    className={styles.utility}
                    onClick={onClose}
                    aria-label={closeLabel}
                    title={closeLabel}
                >
                    <X size={16} aria-hidden='true' />
                </button>
            </div>
            {searchLabel && (
                <div className={styles.search}>
                    <Input
                        ref={searchRef}
                        aria-label={searchLabel}
                        placeholder={searchLabel}
                        value={query}
                        onChange={search}
                        leadingIcon={<Search size={16} aria-hidden='true' />}
                        controlSize='small'
                        fullWidth
                        data-command-search
                    />
                </div>
            )}
            <div className={styles.results} data-command-results>
                {children}
            </div>
            {hint && <div className={styles.hint}>{hint}</div>}
        </div>
    );
}
