'use client';
import { useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSessionStore } from '@/fsd/entities/session';
import { workbookLabels } from '@/fsd/features/workbooks';
import { useI18n } from '@/fsd/shared/i18n';
import { LoadingState } from '@/fsd/shared/ui';
import { WorkbookList } from '../workbook-list/workbook-list';
import { WorkbookDetail } from '../workbook-detail/workbook-detail';

function AuthBoundary({
    children,
    returnTo,
}: {
    children: ReactNode;
    returnTo: string;
}) {
    const status = useSessionStore((state) => state.status);
    const router = useRouter();
    const { locale, href } = useI18n();
    const labels = workbookLabels(locale);
    const login = href(`/login?returnTo=${encodeURIComponent(returnTo)}`);
    useEffect(() => {
        if (status === 'signed-out') router.replace(login);
    }, [status, router, login]);
    if (status !== 'authenticated')
        return (
            <div>
                <LoadingState>{labels.loading}</LoadingState>
                <Link href={login}>{labels.signIn}</Link>
            </div>
        );
    return children;
}
export function WorkbookPage({ workbookId }: { workbookId?: string }) {
    const actorId = useSessionStore((state) => state.user?.id);
    const returnTo = workbookId ? `/workbooks/${workbookId}` : '/workbooks';
    return (
        <AuthBoundary returnTo={returnTo}>
            {workbookId ? (
                <WorkbookDetail
                    key={`${actorId}:${workbookId}`}
                    workbookId={workbookId}
                />
            ) : (
                <WorkbookList key={actorId} />
            )}
        </AuthBoundary>
    );
}
