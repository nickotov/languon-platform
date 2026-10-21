import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { useSessionStore } from '@/fsd/entities/session';
import { useNavigationLayout } from '@/fsd/shared/lib/navigation/use-navigation-layout';
import type { NavigationResourceKind } from '@languon/contracts';

type Preferences = {
    collapsed: boolean;
    sections: Partial<Record<NavigationResourceKind, boolean>>;
};
const initial: Preferences = {
    collapsed: false,
    sections: { dictionary: true, text: false, knowledge: true },
};

export function useAppShellState() {
    const pathname = usePathname();
    const userId = useSessionStore((state) => state.user?.id ?? 'guest');
    const menuButtonRef = useRef<HTMLButtonElement>(null);
    const [preferences, setPreferences] = useState<Preferences>(initial);
    const [width, setWidth] = useState(1280);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [accountOpen, setAccountOpen] = useState(false);
    const [paletteOpen, setPaletteOpen] = useState(false);
    const [sessionExpanded, setSessionExpanded] = useState(false);
    const editorOpen = useNavigationLayout((state) => state.editorOpen);
    const tutorOpen = useNavigationLayout((state) => state.tutorOpen);
    const storageKey = `languon:sidebar:${userId}`;
    const tablet = width >= 768 && width < 1024;
    const adaptive =
        width < 1280 && editorOpen && tutorOpen && !sessionExpanded;
    const railCollapsed = tablet || preferences.collapsed || adaptive;

    useEffect(() => {
        setPreferences(initial);
        setSessionExpanded(false);
        try {
            const parsed = JSON.parse(
                window.localStorage.getItem(storageKey) ?? 'null',
            ) as unknown;
            if (parsed && typeof parsed === 'object') {
                const value = parsed as Partial<Preferences>;
                const sections = { ...initial.sections };
                for (const kind of [
                    'dictionary',
                    'text',
                    'knowledge',
                ] as const) {
                    if (typeof value.sections?.[kind] === 'boolean')
                        sections[kind] = value.sections[kind];
                }
                setPreferences({
                    collapsed: value.collapsed === true,
                    sections,
                });
            }
        } catch {
            /* Device preferences are optional. */
        }
    }, [storageKey]);

    useEffect(() => {
        function resize() {
            setWidth(window.innerWidth);
        }
        resize();
        window.addEventListener('resize', resize);
        return () => window.removeEventListener('resize', resize);
    }, []);

    useEffect(() => {
        setDrawerOpen(false);
        setAccountOpen(false);
        setPaletteOpen(false);
    }, [pathname, userId]);

    useEffect(() => {
        if (width >= 1024) setDrawerOpen(false);
    }, [width]);

    function save(next: Preferences) {
        setPreferences(next);
        try {
            window.localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
            /* In-memory state remains usable. */
        }
    }
    function toggleRail() {
        if (tablet) {
            setDrawerOpen(true);
            return;
        }
        const collapsed = !railCollapsed;
        if (!collapsed) setSessionExpanded(true);
        save({ ...preferences, collapsed });
        setAccountOpen(false);
    }
    function toggleSection(kind: NavigationResourceKind) {
        save({
            ...preferences,
            sections: {
                ...preferences.sections,
                [kind]: !preferences.sections[kind],
            },
        });
    }
    function closeDrawer(restoreFocus = true) {
        setDrawerOpen(false);
        setAccountOpen(false);
        if (restoreFocus)
            window.requestAnimationFrame(() => menuButtonRef.current?.focus());
    }
    return {
        accountOpen,
        closeDrawer,
        drawerOpen,
        menuButtonRef,
        paletteOpen,
        preferences,
        railCollapsed,
        setAccountOpen,
        setDrawerOpen,
        setPaletteOpen,
        toggleRail,
        toggleSection,
    };
}
export type AppShellState = ReturnType<typeof useAppShellState>;
