import { Link2Off } from 'lucide-react';
import { ButtonLink } from '@/fsd/shared/ui';
import { useI18n } from '@/fsd/shared/i18n';
import styles from './unavailable.module.css';
export function PublicUnavailable() {
    const { href, t } = useI18n();
    return (
        <main className={styles.unavailable}>
            <div className={styles.unavailableCard}>
                <div className={styles.unavailableIcon}>
                    <Link2Off size={24} aria-hidden />
                </div>
                <h1>{t('texts.public.unavailable')}</h1>
                <p>{t('texts.public.unavailableHelp')}</p>
                <ButtonLink href={href('/texts')}>
                    {t('texts.public.goHome')}
                </ButtonLink>
            </div>
        </main>
    );
}
