import type { Metadata } from 'next';

import { DictionaryEditorPage } from '@/fsd/pages/dictionaries';
import { getRequestI18n } from '@/fsd/shared/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
    const { t } = await getRequestI18n();
    return { title: t('meta.dictionaryEditor') };
}

export default async function Page({
    params,
}: {
    params: Promise<{ dictionaryId: string }>;
}) {
    const { dictionaryId } = await params;
    return <DictionaryEditorPage dictionaryId={dictionaryId} />;
}
