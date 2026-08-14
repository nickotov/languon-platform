import type { Metadata } from 'next';

import { LoginPage } from '@/fsd/pages/login/ui/login-page';
import { localizedMetadata } from '@/fsd/shared/i18n/metadata';

export async function generateMetadata(): Promise<Metadata> {
    return localizedMetadata('meta.login');
}

function single(value: string | string[] | undefined): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

export default async function Page({
    searchParams,
}: {
    searchParams: Promise<{
        passwordReset?: string | string[];
        returnTo?: string | string[];
    }>;
}) {
    const parameters = await searchParams;
    return (
        <LoginPage
            passwordReset={single(parameters.passwordReset)}
            returnTo={single(parameters.returnTo)}
        />
    );
}
