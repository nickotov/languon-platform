import { TextsLibraryPage } from '@/fsd/pages/texts';
import { getRequestI18n } from '@/fsd/shared/i18n/server';
export async function generateMetadata() {
    const { t } = await getRequestI18n();
    return { title: t('texts.manage.navigation') };
}
export default function Page() {
    return <TextsLibraryPage />;
}
