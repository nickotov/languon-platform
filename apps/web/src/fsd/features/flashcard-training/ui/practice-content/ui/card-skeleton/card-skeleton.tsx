import { useI18n } from '@/fsd/shared/i18n';
import { Skeleton } from '@/fsd/shared/ui';
import styles from '../../../styles/practice-content-common.module.css';

export function CardSkeleton() {
    const { t } = useI18n();

    return (
        <div className={styles.skeleton}>
            <div className={styles.skeletonCard}>
                <Skeleton width='30%' />
                <div className={styles.skeletonFields}>
                    <Skeleton lines={3} />
                </div>
            </div>
            <p className={styles.saving}>{t('training.preparing')}</p>
        </div>
    );
}
