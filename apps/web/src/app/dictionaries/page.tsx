import type { Metadata } from 'next';

import { DictionariesPage } from '@/fsd/pages/dictionaries';
import { getRequestI18n } from '@/fsd/shared/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
    const { t } = await getRequestI18n();
    return { title: t('meta.dictionaries') };
}

export default function Page() {
    return <DictionariesPage />;
}
