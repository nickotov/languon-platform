'use client';

import type { ReactNode } from 'react';
import { AppShell } from '../app-shell/app-shell';

export function ApplicationChrome({ children }: { children: ReactNode }) {
    return <AppShell>{children}</AppShell>;
}
