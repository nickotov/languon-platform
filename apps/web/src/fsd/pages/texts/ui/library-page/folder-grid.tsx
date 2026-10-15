import { useState } from 'react';
import type { TextFolder } from '@languon/contracts';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, Skeleton } from '@/fsd/shared/ui';
import { FolderCard } from './folder-card';
import styles from './library-page.module.css';
export function FolderGrid({
    folders,
    onEdit,
    onShare,
    onArchive,
    onRestore,
    pending,
}: {
    folders: TextFolder[];
    onEdit(folder: TextFolder): void;
    onShare(folder: TextFolder): void;
    onArchive(folder: TextFolder): void;
    onRestore(folder: TextFolder): void;
    pending: boolean;
}) {
    const { t } = useI18n();
    const [limit, setLimit] = useState(25);
    const visible = folders.slice(0, limit);
    const hasMore = folders.length > limit;
    function more() {
        setLimit((current) => current + 25);
    }
    return (
        <>
            <ul className={styles.grid}>
                {visible.map((folder) => (
                    <li key={folder.id} className={styles.gridItem}>
                        <FolderCard
                            folder={folder}
                            onEdit={onEdit}
                            onShare={onShare}
                            onArchive={onArchive}
                            onRestore={onRestore}
                            pending={pending}
                        />
                    </li>
                ))}
            </ul>
            {hasMore && (
                <Button
                    className={styles.more}
                    variant='secondary'
                    onClick={more}
                >
                    {t('texts.library.more')}
                </Button>
            )}
        </>
    );
}

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
