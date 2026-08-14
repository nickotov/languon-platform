import type { Metadata } from 'next';

import { NotFoundPage } from '@/fsd/pages/not-found/ui/not-found-page';
import { getRequestI18n } from '@/fsd/shared/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
    const { t } = await getRequestI18n();
    return { title: t('meta.notFound') };
}

export default async function NotFound() {
    return <NotFoundPage />;
}
