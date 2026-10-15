'use client';
import Link from 'next/link';
import { useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useSessionStore } from '@/fsd/entities/session';
import { useI18n } from '@/fsd/shared/i18n';
import { LoadingState } from '@/fsd/shared/ui';

export function TextsAuthBoundary({
    children,
    returnTo,
}: {
    children: ReactNode;
    returnTo: string;
}) {
    const status = useSessionStore((state) => state.status);
    const router = useRouter();
    const { t, href } = useI18n();
    const login = href(`/login?returnTo=${encodeURIComponent(returnTo)}`);
    useEffect(() => {
        if (status === 'signed-out') router.replace(login);
    }, [status, router, login]);
    if (status !== 'authenticated')
        return (
            <div>
                <LoadingState>{t('texts.manage.loading')}</LoadingState>
                {status === 'signed-out' && (
                    <Link href={login}>{t('texts.manage.signIn')}</Link>
                )}
            </div>
        );
    return children;
}
