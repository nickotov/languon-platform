import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useI18n } from '@/fsd/shared/i18n';
import { IconButton } from '@/fsd/shared/ui';
import styles from './dictionary-card-form.module.css';

export function FormVersionNavigation({
    current,
    onChange,
    total,
}: {
    current: number;
    onChange(index: number): void;
    total: number;
}) {
    const { t } = useI18n();
    if (total < 2) return null;

    return (
        <nav
            aria-label={t('dictionary.authoring.versions')}
            className={styles.versionNavigation}
        >
            <IconButton
                className={styles.versionButton}
                disabled={current === 0}
                label={t('dictionary.authoring.previousVersion')}
                onClick={() => onChange(current - 1)}
                size='compact'
                variant='ghost'
            >
                <ChevronLeft />
            </IconButton>
            <span aria-live='polite' className={styles.versionCounter}>
                {t('dictionary.authoring.versionCounter', {
                    current: current + 1,
                    total,
                })}
            </span>
            <IconButton
                className={styles.versionButton}
                disabled={current === total - 1}
                label={t('dictionary.authoring.nextVersion')}
                onClick={() => onChange(current + 1)}
                size='compact'
                variant='ghost'
            >
                <ChevronRight />
            </IconButton>
        </nav>
    );
}
