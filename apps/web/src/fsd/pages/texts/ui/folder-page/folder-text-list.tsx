import {
    ArchiveIcon,
    FileTextIcon,
    PlusIcon,
    RefreshCwIcon,
} from 'lucide-react';
import { useState } from 'react';
import { useAuth } from '@/fsd/features/auth';
import { NewTextDialog } from '@/fsd/features/text-management';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, EmptyState, InlineAlert, Skeleton } from '@/fsd/shared/ui';
import type { TextDocument } from '@languon/contracts';
import type { useTextFolder } from '../../hooks/use-text-folder';
import { TextRow, type TextRowAction } from './text-row';
import styles from './folder-page.module.css';

export function FolderTextList({
    folderId,
    list,
    view,
    readOnly,
    shared,
    restoreError,
    onAction,
    onRestore,
    onPreview,
}: {
    folderId: string;
    list: ReturnType<typeof useTextFolder>;
    view: 'active' | 'archived';
    readOnly: boolean;
    shared: boolean;
    restoreError: boolean;
    onAction(type: TextRowAction, document: TextDocument): void;
    onRestore(document: TextDocument): void;
    onPreview(): void;
}) {
    const { t } = useI18n();
    const { requestWithSession } = useAuth();
    const [creating, setCreating] = useState(false);
    function closeCreate() {
        setCreating(false);
    }

    function add() {
        setCreating(true);
    }

    function more() {
        void list.fetchNextPage();
    }

    function retry() {
        void list.refetch();
    }

    const retryButton = (
        <Button
            desktopIconOnly
            size='compact'
            variant='secondary'
            leadingIcon={<RefreshCwIcon className={styles.actionIcon} />}
            onClick={retry}
        >
            {t('texts.library.retry')}
        </Button>
    );
    const emptyTitle =
        view === 'active'
            ? t('texts.folder.emptyTitle')
            : t('texts.folder.archiveEmptyTitle');
    const emptyHelp =
        view === 'active'
            ? t('texts.folder.emptyHelp')
            : t('texts.folder.archiveEmptyHelp');
    const emptyIcon =
        view === 'active' ? (
            <FileTextIcon className={styles.actionIcon} />
        ) : (
            <ArchiveIcon className={styles.actionIcon} />
        );
    const emptyAction =
        !readOnly && view === 'active' ? (
            <Button
                desktopIconOnly
                onClick={add}
                leadingIcon={<PlusIcon className={styles.actionIcon} />}
            >
                {t('texts.folder.add')}
            </Button>
        ) : undefined;

    return (
        <section className={styles.section} aria-busy={list.isPending}>
            <NewTextDialog
                open={creating}
                initialFolderId={folderId}
                onClose={closeCreate}
                requestWithSession={requestWithSession}
            />
            {list.isPending && (
                <div className={styles.rows}>
                    {[0, 1, 2].map((index) => (
                        <div className={styles.skeletonRow} key={index}>
                            <Skeleton width='45%' />
                            <Skeleton width='70%' />
                        </div>
                    ))}
                </div>
            )}
            {list.isError && (
                <InlineAlert
                    tone='error'
                    title={t('texts.folder.error')}
                    actions={retryButton}
                >
                    {t('texts.library.errorHelp')}
                </InlineAlert>
            )}
            {restoreError && (
                <InlineAlert tone='error'>
                    {t('texts.library.mutationError')}
                </InlineAlert>
            )}
            {list.isSuccess && list.documents.length === 0 && (
                <div className={styles.empty}>
                    <span className={styles.emptyIcon} aria-hidden='true'>
                        {emptyIcon}
                    </span>
                    <EmptyState title={emptyTitle} action={emptyAction}>
                        {emptyHelp}
                    </EmptyState>
                </div>
            )}
            {list.documents.length > 0 && (
                <ul className={styles.rows}>
                    {list.documents.map((document) => (
                        <TextRow
                            key={document.id}
                            document={document}
                            readOnly={readOnly}
                            pending={list.restore.isPending}
                            onAction={onAction}
                            onRestore={onRestore}
                        />
                    ))}
                </ul>
            )}
            {list.hasNextPage && (
                <Button
                    className={styles.more}
                    variant='secondary'
                    onClick={more}
                    loading={list.isFetchingNextPage}
                >
                    {t('texts.library.more')}
                </Button>
            )}
            {shared && view === 'active' && !list.isPending && (
                <p className={styles.shareHelp}>
                    {t('texts.folder.sharedHelp')}{' '}
                    <button
                        type='button'
                        className={styles.preview}
                        onClick={onPreview}
                    >
                        {t('texts.folder.preview')}
                    </button>
                </p>
            )}
        </section>
    );
}
