import type { Metadata } from 'next';
import { WorkbookExercisesPage, guideUiCopy } from '@/fsd/pages/workbook-guide';
import { getRequestI18n } from '@/fsd/shared/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
    const { locale } = await getRequestI18n();
    const copy = guideUiCopy(locale);

    return {
        title: `${copy.chapter} · ${copy.title}`,
        description: copy.chapterIntro,
    };
}

export default async function Page({
    searchParams,
}: {
    searchParams: Promise<{ activity?: string | string[] }>;
}) {
    const [{ locale }, query] = await Promise.all([
        getRequestI18n(),
        searchParams,
    ]);
    const activity =
        typeof query.activity === 'string' ? query.activity : undefined;

    return <WorkbookExercisesPage locale={locale} activity={activity} />;
}
