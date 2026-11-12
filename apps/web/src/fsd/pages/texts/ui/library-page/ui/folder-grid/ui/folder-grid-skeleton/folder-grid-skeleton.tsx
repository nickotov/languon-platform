import { Skeleton } from '@/fsd/shared/ui';
import styles from '../../../../../styles/library-page-common.module.css';

export function FolderGridSkeleton() {
    return (
        <div className={styles.grid}>
            {[0, 1, 2].map((index) => (
                <div className={styles.card} key={index}>
                    <Skeleton variant='rect' width={40} height={40} />
                    <Skeleton lines={2} />
                    <Skeleton width='40%' />
                </div>
            ))}
        </div>
    );
}
