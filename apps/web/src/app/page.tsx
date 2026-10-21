import { HomePage } from '@/fsd/pages/home/ui/home-page';
import { getRequestLocale } from '@/fsd/shared/i18n/server';

export default async function Page() {
    const locale = await getRequestLocale();
    const dateLabel = new Intl.DateTimeFormat(locale, {
        weekday: 'long', month: 'long', day: 'numeric',
    }).format(new Date());
    return <HomePage dateLabel={dateLabel} />;
}
