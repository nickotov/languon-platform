import type { Metadata } from 'next';

import { ResetPasswordPage } from '@/fsd/pages/reset-password/ui/reset-password-page';

export const metadata: Metadata = { title: 'Choose a new password · Languon' };

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
