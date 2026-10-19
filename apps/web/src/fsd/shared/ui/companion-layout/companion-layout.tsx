'use client';

import { createContext, useContext, useState, type ReactNode } from 'react';
import styles from './companion-layout.module.css';

type CompanionPlacement = {
    expanded: boolean;
    setExpanded(expanded: boolean): void;
    detached: boolean;
    setDetached(detached: boolean): void;
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
}: {
    children: ReactNode;
    companion: ReactNode;
    fill?: boolean;
}) {
    const [expanded, setExpanded] = useState(false);
    const [detached, setDetached] = useState(false);
    const placement = { expanded, setExpanded, detached, setDetached };
    const className = [styles.layout, fill && styles.fill]
        .filter(Boolean)
        .join(' ');
    return (
        <CompanionContext.Provider value={placement}>
            <div
                className={className}
                data-companion-layout
                data-expanded={expanded}
                data-detached={detached}
            >
                <div className={styles.content} data-companion-content>
                    {children}
                </div>
                <div className={styles.slot} data-companion-slot>
                    {companion}
                </div>
            </div>
        </CompanionContext.Provider>
    );
}
