import type { Metadata } from 'next';

import { VerifyEmailPage } from '@/fsd/pages/verify-email/ui/verify-email-page';
import { localizedMetadata } from '@/fsd/shared/i18n/metadata';

export async function generateMetadata(): Promise<Metadata> {
    return localizedMetadata('meta.verifyEmail');
}

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
