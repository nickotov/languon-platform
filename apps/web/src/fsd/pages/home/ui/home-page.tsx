'use client';

import { useSessionStore } from '@/fsd/entities/session';
import { useAuth } from '@/fsd/features/auth';
import { PortraitEntryCard } from '@/fsd/features/portrait-entry';
import { useI18n } from '@/fsd/shared/i18n';
import styles from './home-page.module.css';

const greetings = {
    en: 'Welcome back',
    ru: 'С возвращением',
    fr: 'Bon retour',
    es: 'Te damos la bienvenida',
};

export function HomePage({ dateLabel }: { dateLabel?: string }) {
    const { locale } = useI18n();
    const user = useSessionStore((state) => state.user);
    const { requestWithSession } = useAuth();
    const greeting = user?.handle
        ? `${greetings[locale]}, @${user.handle}`
        : greetings[locale];

    return (
        <main className={styles.main}>
            <header>
                {dateLabel && <p className={styles.date}>{dateLabel}</p>}
                <h1 className={styles.title}>{greeting}</h1>
            </header>
            <PortraitEntryCard variant='dashboard' requestWithSession={requestWithSession} />
        </main>
    );
}
