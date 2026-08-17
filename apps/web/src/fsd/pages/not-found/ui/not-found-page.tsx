import { getRequestI18n } from '@/fsd/shared/i18n/server';
import { ButtonLink, Card, Heading } from '@/fsd/shared/ui';
import styles from './not-found-page.module.css';

export async function NotFoundPage() {
    const { t } = await getRequestI18n();

    return (
        <main className={styles.main}>
            <Card className={styles.card}>
                <div className={styles.eyebrow}>{t('notFound.eyebrow')}</div>
                <Heading level={1}>{t('notFound.title')}</Heading>
                <p className={styles.description}>
                    {t('notFound.description')}
                </p>
                <ButtonLink href='/'>{t('notFound.home')}</ButtonLink>
            </Card>
        </main>
    );
}
