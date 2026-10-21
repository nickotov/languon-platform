'use client';

import {
    createContext,
    useContext,
    useState,
    useRef,
    useId,
    useEffect,
    type ReactNode,
} from 'react';
import styles from './companion-layout.module.css';
import { useNavigationLayout } from '../../lib/navigation/use-navigation-layout';
import { useCompanionResize } from './use-companion-resize';
import {
    useWorkspaceLayout,
    type WorkspaceLayoutMode,
    type WorkspaceMobileTab,
} from './use-workspace-layout';

type CompanionPlacement = {
    workspace: boolean;
    contentId: string;
    documentPanelId: string;
    documentTabId: string;
    tutorTabId: string;
    mobile: boolean;
    inline: boolean;
    overlay: boolean;
    companionId: string;
    mode: WorkspaceLayoutMode;
    setMode(mode: WorkspaceLayoutMode): void;
    mobileTab: WorkspaceMobileTab;
    setMobileTab(tab: WorkspaceMobileTab): void;
    allowChatLayout: boolean;
    expanded: boolean;
    setExpanded(expanded: boolean): void;
    detached: boolean;
    setDetached(detached: boolean): void;
    halfWidth: boolean;
    setHalfWidth(halfWidth: boolean): void;
};
const CompanionContext = createContext<CompanionPlacement | null>(null);

/** Optional placement contract for a companion rendered in the named slot. */
export function useCompanionLayout() {
    return useContext(CompanionContext);
}

export function CompanionLayout({
    children,
    companion,
    fill = false,
    variant = 'default',
    resizeLabel = 'Resize companion panel',
}: {
    children: ReactNode;
    companion: ReactNode;
    fill?: boolean;
    variant?: 'default' | 'workspace';
    resizeLabel?: string;
}) {
    const [expanded, setExpanded] = useState(false);
    const [detached, setDetached] = useState(false);
    const workspace = variant === 'workspace';
    const root = useRef<HTMLDivElement>(null);
    const view = useWorkspaceLayout(workspace, root);
    const resizable =
        workspace &&
        view.inline &&
        expanded &&
        !detached &&
        view.mode === 'split';
    const resize = useCompanionResize(resizable, root);
    const companionId = useId();
    const publishLayout = useNavigationLayout((state) => state.publish);
    const removeLayout = useNavigationLayout((state) => state.remove);
    const tutorVisible = expanded && (!workspace || view.mode !== 'focus');
    useEffect(() => {
        publishLayout(companionId, tutorVisible);
    }, [companionId, tutorVisible, publishLayout]);
    useEffect(
        () => () => removeLayout(companionId),
        [companionId, removeLayout],
    );
    const { halfWidth, setHalfWidth } = resize;
    const contentId = `${companionId}-document`;
    const placement = {
        documentPanelId: `${companionId}-document-panel`,
        documentTabId: `${companionId}-document-tab`,
        tutorTabId: `${companionId}-tutor-tab`,
        contentId,
        companionId,
        ...view,
        workspace,
        expanded,
        setExpanded,
        detached,
        setDetached,
        halfWidth,
        setHalfWidth,
    };
    const className = [styles.layout, fill && styles.fill]
        .filter(Boolean)
        .join(' ');
    return (
        <CompanionContext.Provider value={placement}>
            <div
                ref={resize.root}
                style={resize.style}
                className={className}
                data-resizing={resize.resizing}
                data-layout-mode={view.mode}
                data-inline={view.inline}
                data-overlay={view.overlay}
                data-mobile-tab={view.mobileTab}
                data-variant={variant}
                data-companion-layout
                data-expanded={expanded}
                data-detached={detached}
                data-half-width={halfWidth}
            >
                <div
                    id={contentId}
                    className={styles.content}
                    data-companion-content
                >
                    {children}
                </div>
                <div
                    ref={resize.slot}
                    id={companionId}
                    role={workspace && view.mobile ? 'tabpanel' : undefined}
                    aria-labelledby={
                        workspace && view.mobile
                            ? placement.tutorTabId
                            : undefined
                    }
                    className={styles.slot}
                    data-companion-slot
                >
                    {resize.enabled && (
                        <div
                            className={styles.resizeHandle}
                            role='separator'
                            tabIndex={0}
                            aria-label={resizeLabel}
                            aria-orientation='vertical'
                            aria-controls={companionId}
                            aria-valuemin={resize.minimumPercent}
                            aria-valuemax={resize.maximumPercent}
                            aria-valuenow={resize.currentPercent}
                            aria-valuetext={`${Math.round(resize.currentPercent)}%`}
                            data-companion-resize
                            onPointerDown={resize.pointerDown}
                            onPointerMove={resize.pointerMove}
                            onPointerUp={resize.pointerUp}
                            onPointerCancel={resize.pointerCancel}
                            onLostPointerCapture={resize.pointerUp}
                            onKeyDown={resize.keyDown}
                        />
                    )}
                    {companion}
                </div>
            </div>
        </CompanionContext.Provider>
    );
}
