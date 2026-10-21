'use client';
import { useState } from 'react';
import type { TextFolder } from '@languon/contracts';
import {
    ArchiveIcon,
    ChevronRightIcon,
    FileTextIcon,
    FolderIcon,
    FolderPlusIcon,
    RefreshCwIcon,
} from 'lucide-react';
import { useAuth } from '@/fsd/features/auth';
import {
    NewTextDialog,
    ArchiveTextDialog,
    FolderFormDialog,
    TextShareDialog,
    TextsAuthBoundary,
} from '@/fsd/features/text-management';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, InlineAlert, Tabs } from '@/fsd/shared/ui';
import { useTextLibrary } from '../../hooks/use-text-library';
import { FolderGrid, FolderGridSkeleton } from './folder-grid';
import { IndependentTexts } from './independent-texts';
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
    const [creatingText, setCreatingText] = useState(false);
    function newText() {
        setCreatingText(true);
    }
    function closeText() {
        setCreatingText(false);
    }
    const [view, setView] = useState<'active' | 'archived'>('active');
    const [dialog, setDialog] = useState<Dialog>(null);
    const folders = library.folders.filter(
        (folder) => folder.lifecycle === view,
    );
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
            label: t('texts.organization.active'),
        },
        {
            value: 'archived',
            label: t('texts.library.archived'),
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
                <div className={styles.headerButtons}>
                    <Button
                        className={styles.headerAction}
                        size='default'
                        onClick={newText}
                        disabled={!ready}
                        leadingIcon={
                            <FileTextIcon className={styles.actionIcon} />
                        }
                    >
                        {t('texts.organization.newText')}
                    </Button>
                    <Button
                        className={styles.headerAction}
                        size='default'
                        variant='secondary'
                        onClick={create}
                        leadingIcon={
                            <FolderPlusIcon className={styles.actionIcon} />
                        }
                        disabled={!ready}
                    >
                        {t('texts.library.newFolder')}
                    </Button>
                </div>
            </header>
            {ready && (
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
            <details open className={styles.section}>
                <summary className={styles.sectionHeading}>
                    <FolderIcon aria-hidden className={styles.sectionIcon} />
                    <h2 className={styles.sectionTitle}>
                        {t('texts.organization.folders')}
                    </h2>
                    <ChevronRightIcon
                        aria-hidden
                        className={styles.sectionChevron}
                    />
                </summary>
                <section
                    className={styles.sectionContent}
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
                            <span
                                className={styles.emptyIcon}
                                aria-hidden='true'
                            >
                                {emptyIcon}
                            </span>
                            <div className={styles.emptyCopy}>
                                <h3 className={styles.emptyTitle}>
                                    {emptyTitle}
                                </h3>
                                <p className={styles.emptyHelp}>{emptyHelp}</p>
                            </div>
                            {view === 'active' ? newButton : null}
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
            </details>
            <details open className={styles.section}>
                <summary className={styles.sectionHeading}>
                    <FileTextIcon aria-hidden className={styles.sectionIcon} />
                    <h2 className={styles.sectionTitle}>
                        {t('texts.organization.independent')}
                    </h2>
                    <ChevronRightIcon
                        aria-hidden
                        className={styles.sectionChevron}
                    />
                </summary>
                <div className={styles.sectionContent}>
                    <IndependentTexts
                        lifecycle={view}
                        requestWithSession={requestWithSession}
                    />
                </div>
            </details>
            <NewTextDialog
                open={creatingText}
                onClose={closeText}
                requestWithSession={requestWithSession}
            />
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
