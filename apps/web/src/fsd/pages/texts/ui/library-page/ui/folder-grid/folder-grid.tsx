import { useState } from 'react';
import type { TextFolder } from '@languon/contracts';
import { useI18n } from '@/fsd/shared/i18n';
import { Button } from '@/fsd/shared/ui';
import { FolderCard } from '../folder-card/folder-card';
import styles from '../../../styles/library-page-common.module.css';

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
