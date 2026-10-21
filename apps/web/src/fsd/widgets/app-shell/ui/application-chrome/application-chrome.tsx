'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { AppShell } from '../app-shell/app-shell';

export function ApplicationChrome({ children }: { children: ReactNode }) {
    const pathname = usePathname();
    const publicText = /^\/shared\/(?:texts|text-folders)\//.test(pathname);
    const portraitInterview = pathname === '/portrait/interview';
    if (portraitInterview) return <div id='main-content'>{children}</div>;
    if (publicText) return <main id='main-content'>{children}</main>;
    return <AppShell>{children}</AppShell>;
}
