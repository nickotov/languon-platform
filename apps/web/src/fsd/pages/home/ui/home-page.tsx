'use client';

import { HomeSessionActions } from '@/fsd/features/auth';
import { useI18n } from '@/fsd/shared/i18n';
import styles from './home-page.module.css';

export function HomePage() {
    const { t } = useI18n();
    return (
        <main className={styles.main}>
            <section className={styles.content}>
                <div className={styles.eyebrow}>{t('home.eyebrow')}</div>
                <h1 className={styles.title}>Languon</h1>
                <p className={styles.description}>{t('home.description')}</p>
                <HomeSessionActions />
            </section>
        </main>
    );
}
