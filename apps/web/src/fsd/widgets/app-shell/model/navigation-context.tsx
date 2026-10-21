'use client';
import { createContext, useContext } from 'react';
import type { NavigationResourceKind } from '@languon/contracts';
import type { RequestWithSession } from '@/fsd/entities/dictionary';
export type ShellNavigation = {
    requestWithSession: RequestWithSession;
    openSearch(): void;
    create(kind: NavigationResourceKind): void;
    creating: boolean;
};
export const ShellNavigationContext = createContext<ShellNavigation | null>(
    null,
);
export function useShellNavigation() {
    const value = useContext(ShellNavigationContext);
    if (!value) throw new Error('Missing shell navigation');
    return value;
}
