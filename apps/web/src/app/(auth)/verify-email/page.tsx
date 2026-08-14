import type { Metadata } from 'next';

import { VerifyEmailPage } from '@/fsd/pages/verify-email/ui/verify-email-page';

export const metadata: Metadata = { title: 'Verify email · Languon' };

function single(value: string | string[] | undefined): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

export default async function Page({
    searchParams,
}: {
    searchParams: Promise<{
        flowId?: string | string[];
        resendAvailableAt?: string | string[];
        returnTo?: string | string[];
    }>;
}) {
    const parameters = await searchParams;
    return (
        <VerifyEmailPage
            flowId={single(parameters.flowId)}
            resendAvailableAt={single(parameters.resendAvailableAt)}
            returnTo={single(parameters.returnTo)}
        />
    );
}
