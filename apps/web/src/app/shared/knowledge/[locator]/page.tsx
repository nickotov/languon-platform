import type { Metadata } from 'next';
import { SharedKnowledgePage } from '@/fsd/pages/knowledge';
import { getRequestI18n } from '@/fsd/shared/i18n/server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
    const { t } = await getRequestI18n();
    return {
        referrer: 'no-referrer',
        robots: { follow: false, index: false },
        title: t('knowledge.title'),
    };
}

export default async function Page({
    params,
}: {
    params: Promise<{ locator: string }>;
}) {
    const { locator } = await params;
    return <SharedKnowledgePage locator={locator} />;
}
