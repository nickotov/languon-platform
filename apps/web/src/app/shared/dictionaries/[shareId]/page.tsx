import type { Metadata } from 'next';

import { SharedDictionaryPage } from '@/fsd/pages/shared-dictionary';
import { getRequestI18n } from '@/fsd/shared/i18n/server';

export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;

export async function generateMetadata(): Promise<Metadata> {
    const { t } = await getRequestI18n();
    return {
        referrer: 'no-referrer',
        robots: { follow: false, index: false },
        title: t('meta.sharedDictionary'),
    };
}

export default async function Page({
    params,
}: {
    params: Promise<{ shareId: string }>;
}) {
    const { shareId } = await params;
    return <SharedDictionaryPage shareId={shareId} />;
}
