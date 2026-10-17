'use client';
import { useState } from 'react';
import type { TextFolder } from '@languon/contracts';
import { ArchiveIcon, FolderPlusIcon, RefreshCwIcon } from 'lucide-react';
import { useAuth } from '@/fsd/features/auth';
import {
    ArchiveTextDialog,
    FolderFormDialog,
    TextShareDialog,
    TextsAuthBoundary,
} from '@/fsd/features/text-management';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, EmptyState, InlineAlert, Tabs } from '@/fsd/shared/ui';
import { useTextLibrary } from '../../hooks/use-text-library';
import { FolderGrid, FolderGridSkeleton } from './folder-grid';
import styles from './library-page.module.css';

type Dialog =
    | { type: 'create' }
    | { type: 'edit' | 'archive' | 'share'; folder: TextFolder }
    | null;

export function TextsLibraryPage() {
    return (
        <TextsAuthBoundary returnTo='/texts'>
            <LibraryContent />
        </TextsAuthBoundary>
    );
}

function LibraryContent() {
    const { t } = useI18n();
    const { requestWithSession } = useAuth();
    const library = useTextLibrary(requestWithSession);
    const [view, setView] = useState<'active' | 'archived'>('active');
    const [dialog, setDialog] = useState<Dialog>(null);
    const folders = library.folders.filter(
        (folder) => folder.lifecycle === view,
    );
    const activeCount = library.folders.filter(
        (folder) => folder.lifecycle === 'active',
    ).length;
    const archivedCount = library.folders.filter(
        (folder) => folder.lifecycle === 'archived',
    ).length;
    const hasFolders = activeCount + archivedCount > 0;
    const ready = library.isSuccess;

    function create() {
        setDialog({ type: 'create' });
    }

    function edit(folder: TextFolder) {
        setDialog({ type: 'edit', folder });
    }

    function archive(folder: TextFolder) {
        setDialog({ type: 'archive', folder });
    }

    function share(folder: TextFolder) {
        setDialog({ type: 'share', folder });
    }

    function restore(folder: TextFolder) {
        library.restore.mutate(folder);
    }

    function close() {
        setDialog(null);
    }

    function changeView(value: string) {
        setView(value === 'archived' ? 'archived' : 'active');
    }

    function retry() {
        void library.refetch();
    }

    function saved() {
        void library.refresh();
        setDialog(null);
    }

    function folderSaved() {
        setView('active');
        saved();
    }

    const tabs = [
        {
            value: 'active',
            label: t('texts.library.folders'),
            badge: activeCount,
        },
        {
            value: 'archived',
            label: t('texts.library.archived'),
            badge: archivedCount,
            icon: <ArchiveIcon className={styles.actionIcon} />,
        },
    ];
    const sectionLabel =
        view === 'active'
            ? t('texts.library.folders')
            : t('texts.library.archivedFolders');
    const emptyTitle =
        view === 'active'
            ? t('texts.library.emptyTitle')
            : t('texts.library.archiveEmptyTitle');
    const emptyHelp =
        view === 'active'
            ? t('texts.library.emptyHelp')
            : t('texts.library.archiveEmptyHelp');
    const emptyIcon =
        view === 'active' ? (
            <FolderPlusIcon className={styles.actionIcon} />
        ) : (
            <ArchiveIcon className={styles.actionIcon} />
        );
    const newButton = (
        <Button
            desktopIconOnly
            onClick={create}
            leadingIcon={<FolderPlusIcon className={styles.actionIcon} />}
        >
            {t('texts.library.newFolder')}
        </Button>
    );
    const retryButton = (
        <Button
            desktopIconOnly
            variant='secondary'
            size='compact'
            onClick={retry}
            leadingIcon={<RefreshCwIcon className={styles.actionIcon} />}
        >
            {t('texts.library.retry')}
        </Button>
    );
    const formOpen = dialog?.type === 'create' || dialog?.type === 'edit';
    const initial = dialog?.type === 'edit' ? dialog.folder : undefined;

    return (
        <main className={styles.page}>
            <header className={styles.header}>
                <div>
                    <h1 className={styles.title}>{t('texts.library.title')}</h1>
                    <p className={styles.description}>
                        {t('texts.library.description')}
                    </p>
                </div>
                <Button
                    desktopIconOnly
                    size='large'
                    onClick={create}
                    leadingIcon={
                        <FolderPlusIcon className={styles.largeIcon} />
                    }
                    disabled={!ready}
                >
                    {t('texts.library.newFolder')}
                </Button>
            </header>
            {ready && hasFolders && (
                <Tabs
                    className={styles.tabs!}
                    variant='segmented'
                    size='sm'
                    aria-label={sectionLabel}
                    value={view}
                    onValueChange={changeView}
                    items={tabs}
                />
            )}
            <section
                className={styles.section}
                aria-label={sectionLabel}
                aria-busy={library.isPending}
            >
                {library.isPending && <FolderGridSkeleton />}
                {library.isError && (
                    <InlineAlert
                        tone='error'
                        title={t('texts.library.errorTitle')}
                        actions={retryButton}
                    >
                        {t('texts.library.errorHelp')}
                    </InlineAlert>
                )}
                {library.restore.isError && (
                    <InlineAlert tone='error'>
                        {t('texts.library.mutationError')}
                    </InlineAlert>
                )}
                {ready && folders.length === 0 && (
                    <div className={styles.empty}>
                        <span className={styles.emptyIcon} aria-hidden='true'>
                            {emptyIcon}
                        </span>
                        <EmptyState
                            title={emptyTitle}
                            action={view === 'active' ? newButton : undefined}
                        >
                            {emptyHelp}
                        </EmptyState>
                    </div>
                )}
                {ready && folders.length > 0 && (
                    <FolderGrid
                        key={view}
                        folders={folders}
                        onEdit={edit}
                        onShare={share}
                        onArchive={archive}
                        onRestore={restore}
                        pending={library.restore.isPending}
                    />
                )}
            </section>
            <FolderFormDialog
                open={formOpen}
                {...(initial ? { initial } : {})}
                onClose={close}
                onSaved={folderSaved}
                requestWithSession={requestWithSession}
            />
            {dialog?.type === 'archive' && (
                <ArchiveTextDialog
                    open
                    kind='folder'
                    resource={dialog.folder}
                    onClose={close}
                    onSaved={saved}
                    requestWithSession={requestWithSession}
                />
            )}
            {dialog?.type === 'share' && (
                <TextShareDialog
                    open
                    kind='folder'
                    resource={dialog.folder}
                    onClose={close}
                    onChanged={library.refresh}
                    requestWithSession={requestWithSession}
                />
            )}
        </main>
    );
}
