'use client';

import {
    createContext,
    useContext,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react';
import styles from './panel-page-host.module.css';

type PanelOutlet = {
    element: HTMLElement | null;
    restoreOpener(): void;
};
const Outlet = createContext<PanelOutlet | null>(null);

/** The primary view stays mounted so its scroll position, draft and live subscriptions survive review. */
export function PanelPageHost({ children }: { children: ReactNode }) {
    const [outlet, setOutlet] = useState<HTMLDivElement | null>(null);

    const lastControl = useRef<HTMLElement | null>(null);
    const target = useMemo(
        () => ({
            element: outlet,
            restoreOpener() {
                requestAnimationFrame(() =>
                    lastControl.current?.focus({ preventScroll: true }),
                );
            },
        }),
        [outlet],
    );

    return (
        <Outlet.Provider value={target}>
            <div className={styles.outlet} ref={setOutlet} />
            <div
                data-panel-overlay-root
                className={styles.primary}
                onFocusCapture={(event) => {
                    if (event.currentTarget.contains(event.target)) {
                        lastControl.current = event.target;
                    }
                }}
            >
                {children}
            </div>
        </Outlet.Provider>
    );
}

export function usePanelOutlet() {
    return useContext(Outlet);
}
