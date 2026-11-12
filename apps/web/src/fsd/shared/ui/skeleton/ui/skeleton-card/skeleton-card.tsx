import styles from '../../../styles/skeleton-common.module.css';
import type { SkeletonCardProps } from '../../types';
import { Skeleton } from '../../skeleton';

export function SkeletonCard({ className, lines = 3 }: SkeletonCardProps) {
    return (
        <div className={[styles.card, className].filter(Boolean).join(' ')}>
            <div className={styles.cardHeader}>
                <Skeleton
                    animation='shimmer'
                    className={styles.cardAvatar}
                    variant='circle'
                />
                <div className={styles.cardHeading}>
                    <Skeleton
                        animation='shimmer'
                        className={styles.cardTitle}
                    />
                    <Skeleton
                        animation='shimmer'
                        className={styles.cardSubtitle}
                    />
                </div>
            </div>
            <Skeleton animation='shimmer' lines={lines} />
        </div>
    );
}
