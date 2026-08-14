import type { Metadata } from 'next';

import { SignupPage } from '@/fsd/pages/signup/ui/signup-page';
import { localizedMetadata } from '@/fsd/shared/i18n/metadata';

export async function generateMetadata(): Promise<Metadata> {
    return localizedMetadata('meta.signup');
}

function single(value: string | string[] | undefined): string | undefined {
    return typeof value === 'string' ? value : undefined;
}

export default async function Page({
    searchParams,
}: {
    searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
    const { returnTo } = await searchParams;
    return <SignupPage returnTo={single(returnTo)} />;
}
