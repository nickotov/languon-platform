import type { Metadata } from 'next';

import { ResetPasswordPage } from '@/fsd/pages/reset-password/ui/reset-password-page';
import { localizedMetadata } from '@/fsd/shared/i18n/metadata';

export async function generateMetadata(): Promise<Metadata> {
    return localizedMetadata('meta.resetPassword');
}

function single(value: string | string[] | undefined): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

export default async function Page({
    searchParams,
}: {
    searchParams: Promise<{ flowId?: string | string[] }>;
}) {
    const { flowId } = await searchParams;
    return <ResetPasswordPage flowId={single(flowId)} />;
}
