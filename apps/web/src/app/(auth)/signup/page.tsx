import type { Metadata } from 'next';

import { SignupPage } from '@/fsd/pages/signup/ui/signup-page';

export const metadata: Metadata = { title: 'Create an account · Languon' };

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
