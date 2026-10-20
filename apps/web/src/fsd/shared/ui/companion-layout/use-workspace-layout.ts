import { useCallback, useEffect, useState, type RefObject } from 'react';

export type WorkspaceLayoutMode = 'focus' | 'split' | 'chat';
export type WorkspaceMobileTab = 'document' | 'tutor';
const key = 'languon.knowledge.layout.v1';

/** Presentation preferences only; documents and conversations stay server-owned. */
export function useWorkspaceLayout(
    workspace: boolean,
    root: RefObject<HTMLDivElement | null>,
) {
    const [mode, setModeState] = useState<WorkspaceLayoutMode>('split');
    const [mobileTab, setMobileTab] = useState<WorkspaceMobileTab>('document');
    const [ready, setReady] = useState(false);
    const [allowChatLayout, setAllowChatLayout] = useState(false);
    const [inline, setInline] = useState(false);
    const [mobile, setMobile] = useState(false);
    useEffect(() => {
        if (!workspace) return;
        try {
            const value: unknown = JSON.parse(
                localStorage.getItem(key) ?? 'null',
            );
            if (value === 'focus' || value === 'split' || value === 'chat')
                setModeState(value);
        } catch {
            /* Storage may be unavailable. */
        }
        setReady(true);
        const query = window.matchMedia('(min-width: 1024px)');
        const update = () => {
            const font = Number.parseFloat(
                getComputedStyle(document.documentElement).fontSize,
            );
            const fits =
                query.matches &&
                (root.current?.getBoundingClientRect().width ?? 0) >=
                    font * 51.25;
            setInline(fits);
            setAllowChatLayout(fits);
            setMobile(window.matchMedia('(max-width: 767px)').matches);
        };
        update();
        const observer = new ResizeObserver(update);
        if (root.current) observer.observe(root.current);
        query.addEventListener('change', update);
        const small = window.matchMedia('(max-width: 767px)');
        small.addEventListener('change', update);
        return () => {
            observer.disconnect();
            query.removeEventListener('change', update);
            small.removeEventListener('change', update);
        };
    }, [workspace, root]);
    useEffect(() => {
        if (!workspace || !ready) return;
        try {
            localStorage.setItem(key, JSON.stringify(mode));
        } catch {
            /* The current session still works without storage. */
        }
    }, [workspace, ready, mode]);
    const setMode = useCallback((value: WorkspaceLayoutMode) => {
        setModeState(value);
    }, []);
    return {
        mode: mode === 'chat' && !allowChatLayout ? 'split' : mode,
        setMode,
        mobileTab,
        setMobileTab,
        allowChatLayout,
        mobile,
        inline,
        overlay: !mobile && !inline,
    };
}
