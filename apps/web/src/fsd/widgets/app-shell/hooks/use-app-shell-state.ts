import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

const RAIL_KEY = 'languon:app-shell-rail';
const DICTIONARIES_KEY = 'languon:app-shell-dictionaries';

function readSessionBoolean(key: string): boolean | undefined {
    try {
        const value = window.sessionStorage.getItem(key);
        if (value === 'true') return true;
        if (value === 'false') return false;
    } catch {
        return undefined;
    }
    return undefined;
}

function writeSessionBoolean(key: string, value: boolean) {
    try {
        window.sessionStorage.setItem(key, String(value));
    } catch {
        // The in-memory state remains usable when storage is unavailable.
    }
}

export function useAppShellState() {
    const pathname = usePathname();
    const menuButtonRef = useRef<HTMLButtonElement>(null);
    const [railCollapsed, setRailCollapsed] = useState(false);
    const [dictionariesOverride, setDictionariesOverride] = useState<
        boolean | undefined
    >(undefined);
    const [drawerOpen, setDrawerOpen] = useState(false);
    const [accountOpen, setAccountOpen] = useState(false);

    useEffect(() => {
        setRailCollapsed(readSessionBoolean(RAIL_KEY) ?? false);
        setDictionariesOverride(readSessionBoolean(DICTIONARIES_KEY));
    }, []);

    useEffect(() => {
        setDrawerOpen(false);
        setAccountOpen(false);
    }, [pathname]);

    const dictionaryRoute = pathname.startsWith('/dictionaries');
    const dictionariesOpen = dictionariesOverride ?? dictionaryRoute;

    function toggleRail() {
        const next = !railCollapsed;
        setRailCollapsed(next);
        setAccountOpen(false);
        writeSessionBoolean(RAIL_KEY, next);
    }

    function setDictionariesOpen(open: boolean) {
        setDictionariesOverride(open);
        writeSessionBoolean(DICTIONARIES_KEY, open);
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
        dictionariesOpen,
        drawerOpen,
        menuButtonRef,
        railCollapsed,
        setAccountOpen,
        setDictionariesOpen,
        setDrawerOpen,
        toggleRail,
    };
}

export type AppShellState = ReturnType<typeof useAppShellState>;
