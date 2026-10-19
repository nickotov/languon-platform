'use client';
import { LoaderCircle, TriangleAlert } from 'lucide-react';
import {
    useEffect,
    useRef,
    type CSSProperties,
    type KeyboardEvent,
    type ReactNode,
} from 'react';
import { useI18n } from '@/fsd/shared/i18n';
import { Tooltip, useCompanionLayout } from '@/fsd/shared/ui';
import { useTutorLayout } from '../../hooks/use-tutor-layout';
import {
    TutorHeader,
    TutorMark,
    type TutorHeaderActions,
} from './tutor-header';
import type { TutorContextProps } from './tutor-context';
import { tutorShellCopy } from './shell-copy';
import styles from './tutor-shell.module.css';
export type TutorShellProps = TutorContextProps &
    TutorHeaderActions & {
        folded: boolean;
        onFold(): void;
        onExpand(): void;
        active: boolean;
        interrupted: boolean;
        unread: boolean;
        children: ReactNode;
    };
export function TutorShell({
    folded,
    onFold,
    onExpand,
    active,
    interrupted,
    unread,
    children,
    ...props
}: TutorShellProps) {
    const { locale } = useI18n();
    const copy = tutorShellCopy(locale);
    const panelRef = useRef<HTMLElement>(null);
    const launcherRef = useRef<HTMLButtonElement>(null);
    const lastFocus = useRef<HTMLElement | null>(null);
    const firstMount = useRef(true);
    useEffect(() => {
        if (!firstMount.current) return;
        firstMount.current = false;
        if (!folded)
            requestAnimationFrame(() =>
                panelRef.current?.focus({ preventScroll: true }),
            );
    }, [folded]);
    function fold() {
        const focus = document.activeElement;
        if (focus instanceof HTMLElement && panelRef.current?.contains(focus))
            lastFocus.current = focus;
        onFold();
        requestAnimationFrame(() =>
            launcherRef.current?.focus({ preventScroll: true }),
        );
    }
    const placement = useCompanionLayout();
    const hasSlot = Boolean(placement && !placement.detached);
    const layout = useTutorLayout(fold, hasSlot);
    function expand() {
        onExpand();
        requestAnimationFrame(() => {
            if (lastFocus.current?.isConnected)
                lastFocus.current.focus({ preventScroll: true });
            else panelRef.current?.focus({ preventScroll: true });
        });
    }
    function onKeyDown(event: KeyboardEvent<HTMLElement>) {
        if (event.key !== 'Escape' || event.defaultPrevented) return;
        if (
            document.querySelector(
                '[role="menu"], [data-state="open"][role="dialog"]',
            )
        )
            return;
        event.preventDefault();
        fold();
    }
    let panelWidth: CSSProperties['width'] = layout.width;
    if (layout.mobile) panelWidth = undefined;
    else if (layout.attached) panelWidth = '100%';
    const geometry: CSSProperties = {
        height: layout.attached ? '100%' : layout.height,
        width: panelWidth,
        transform: layout.dragX ? `translateX(${layout.dragX}px)` : undefined,
        bottom: layout.mobile ? layout.keyboardInset : undefined,
    };
    let status = copy.title;
    if (active) status = copy.responding;
    else if (interrupted) status = copy.interrupted;
    else if (unread) status = copy.ready;
    const ready = unread && !active && !interrupted;
    const expandLabel = `${copy.open} — ${status}`;
    const sheetLabel = layout.sheetFull ? copy.partial : copy.expand;
    return (
        <div
            ref={layout.areaRef}
            className={styles.area}
            data-dock={layout.dock}
            data-attached={layout.attached && !folded}
        >
            <section
                ref={panelRef}
                tabIndex={-1}
                className={styles.panel}
                style={geometry}
                aria-label={copy.title}
                aria-hidden={folded}
                inert={folded}
                data-folded={folded}
                onKeyDown={onKeyDown}
                onPointerMove={layout.onPointerMove}
                onPointerUp={layout.onPointerUp}
                onPointerCancel={layout.onPointerCancel}
            >
                {layout.mobile && (
                    <button
                        type='button'
                        className={styles.sheetHandle}
                        aria-label={sheetLabel}
                        onPointerDown={layout.onHandlePointerDown}
                        onClick={layout.toggleSheet}
                    >
                        <span />
                    </button>
                )}
                <TutorHeader
                    key={String(folded)}
                    layout={layout}
                    context={props}
                    actions={props}
                    onFold={fold}
                    onPointerDown={layout.onHeaderPointerDown}
                />
                {children}
                {!layout.mobile && !layout.attached && (
                    <div
                        className={styles.resize}
                        role='separator'
                        tabIndex={0}
                        aria-orientation='horizontal'
                        aria-label={copy.resize}
                        aria-valuemin={layout.minHeight}
                        aria-valuemax={layout.maxHeight}
                        aria-valuenow={layout.height}
                        onPointerDown={layout.onResizePointerDown}
                        onKeyDown={layout.onResizeKeyDown}
                        onDoubleClick={layout.toggleFull}
                    >
                        <span />
                    </div>
                )}
            </section>
            {folded && (
                <Tooltip content={copy.launcher} placement='left'>
                    <button
                        ref={launcherRef}
                        type='button'
                        className={styles.pill}
                        onClick={expand}
                        aria-label={expandLabel}
                        data-ready={ready}
                    >
                        <span className={styles.pillMark}>
                            <TutorMark />
                            {ready && <span className={styles.unread} />}
                        </span>
                        {active && (
                            <LoaderCircle
                                className={styles.spinner}
                                aria-hidden
                            />
                        )}
                        {!active && interrupted && (
                            <TriangleAlert
                                className={styles.warning}
                                aria-hidden
                            />
                        )}
                        <span className={styles.status} role='status'>
                            {status}
                        </span>
                    </button>
                </Tooltip>
            )}
        </div>
    );
}
