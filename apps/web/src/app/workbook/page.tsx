import type { Metadata } from 'next';
import { WorkbookGuidePage, guideUiCopy } from '@/fsd/pages/workbook-guide';
import { getRequestI18n } from '@/fsd/shared/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
    const { locale } = await getRequestI18n();
    const copy = guideUiCopy(locale);

    return { title: copy.title, description: copy.intro };
}

export default async function Page() {
    const { locale } = await getRequestI18n();

    return <WorkbookGuidePage locale={locale} />;
}
