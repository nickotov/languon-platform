'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { useSessionStore } from '@/fsd/entities/session';
import { isLocale } from '@/fsd/shared/i18n';

import { AuthenticatedAppShell } from '../authenticated-app-shell/authenticated-app-shell';

function ownerAppRoute(pathname: string) {
    const segments = pathname.split('/').filter(Boolean);

    const first = segments[0];

    const route = first && isLocale(first) ? segments[1] : first;

    return route === 'dictionaries' || route === 'profile';
}

export function ApplicationChrome({
    children,
    publicHeader,
}: {
    children: ReactNode;
    publicHeader: ReactNode;
}) {
    const pathname = usePathname();

    const authenticated = useSessionStore(
        (state) => state.status === 'authenticated',
    );

    if (authenticated && ownerAppRoute(pathname))
        return <AuthenticatedAppShell>{children}</AuthenticatedAppShell>;

    return (
        <>
            {publicHeader}
            {children}
        </>
    );
}
