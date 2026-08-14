'use client';

import { HomeSessionActions } from '@/fsd/features/auth';
import { useI18n } from '@/fsd/shared/i18n';

export function HomePage() {
    const { t } = useI18n();
    return (
        <main className='home'>
            <section className='home__content'>
                <div className='home__eyebrow'>{t('home.eyebrow')}</div>
                <h1>Languon</h1>
                <p>{t('home.description')}</p>
                <HomeSessionActions />
            </section>
        </main>
    );
}
