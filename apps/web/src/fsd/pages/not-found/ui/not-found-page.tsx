import Link from 'next/link';

import { getRequestI18n } from '@/fsd/shared/i18n/server';

export async function NotFoundPage() {
    const { t } = await getRequestI18n();

    return (
        <main className='auth-layout'>
            <section className='auth-card'>
                <div className='eyebrow'>{t('notFound.eyebrow')}</div>
                <h1>{t('notFound.title')}</h1>
                <p className='auth-intro'>{t('notFound.description')}</p>
                <Link className='primary-button' href='/'>
                    {t('notFound.home')}
                </Link>
            </section>
        </main>
    );
}
