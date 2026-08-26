'use client';

import { useRouter } from 'next/navigation';
import { type ReactNode, useEffect } from 'react';

import { useSessionStore } from '@/fsd/entities/session';
import { useI18n } from '@/fsd/shared/i18n';
import { LoadingState } from '@/fsd/shared/ui';

export function AuthenticatedDictionaryBoundary({
    children,
    loadingMessage,
    returnTo,
}: {
    children: ReactNode;
    loadingMessage: string;
    returnTo: string;
}) {
    const { href } = useI18n();
    const router = useRouter();
    const status = useSessionStore((state) => state.status);

    useEffect(() => {
        if (status !== 'signed-out') return;
        router.replace(
            href(`/login?${new URLSearchParams({ returnTo }).toString()}`),
        );
    }, [href, returnTo, router, status]);

    return status === 'authenticated' ? (
        children
    ) : (
        <main>
            <LoadingState>{loadingMessage}</LoadingState>
        </main>
    );
}
