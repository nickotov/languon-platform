'use client';
import { useState } from 'react';
import type { TextDocument } from '@languon/contracts';
import { RefreshCwIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/fsd/features/auth';
import { TextsAuthBoundary } from '@/fsd/features/text-management';
import { useI18n } from '@/fsd/shared/i18n';
import {
    Button,
    EmptyState,
    InlineAlert,
    Skeleton,
    Tabs,
} from '@/fsd/shared/ui';
import { useTextLibrary } from '../../hooks/use-text-library';
import { useTextFolder } from '../../hooks/use-text-folder';
import { FolderHeader, type FolderAction } from './folder-header';
import type { TextRowAction } from './text-row';
import { FolderTextList } from './folder-text-list';
import styles from './folder-page.module.css';

import { FolderDialogs, type FolderDialog } from './folder-dialogs';

export function TextFolderPage({ folderId }: { folderId: string }) {
    const returnTo = `/texts/folders/${folderId}`;

    return (
        <TextsAuthBoundary returnTo={returnTo}>
            <FolderContent folderId={folderId} />
        </TextsAuthBoundary>
    );
}

function FolderContent({ folderId }: { folderId: string }) {
    const { t, href } = useI18n();
    const router = useRouter();
    const { requestWithSession } = useAuth();
    const library = useTextLibrary(requestWithSession);
    const [view, setView] = useState<'active' | 'archived'>('active');
    const [dialog, setDialog] = useState<FolderDialog>(null);
    const folder = library.folders.find((item) => item.id === folderId);
    const active = useTextFolder(
        folderId,
        'active',
        requestWithSession,
        !!folder,
    );
    const archived = useTextFolder(
        folderId,
        'archived',
        requestWithSession,
        !!folder,
    );
    const list = view === 'active' ? active : archived;

    function close() {
        setDialog(null);
    }

    function saved() {
        setDialog(null);
        void library.refresh();
    }

    function folderArchived() {
        saved();
        back();
    }

    function folderAction(type: FolderAction) {
        setDialog({ type });
    }

    function textAction(type: TextRowAction, document: TextDocument) {
        setDialog({ type, document });
    }

    function restoreFolder() {
        if (folder) library.restore.mutate(folder);
    }

    function restoreText(document: TextDocument) {
        list.restore.mutate(document);
    }

    function changeView(value: string) {
        setView(value === 'archived' ? 'archived' : 'active');
    }

    function back() {
        router.push(href('/texts'));
    }

    function preview() {
        setDialog({ type: 'share-folder' });
    }

    function retry() {
        void library.refetch();
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
    if (library.isError)
        return (
            <main className={styles.page}>
                <InlineAlert
                    tone='error'
                    title={t('texts.library.errorTitle')}
                    actions={retryButton}
                >
                    {t('texts.library.errorHelp')}
                </InlineAlert>
            </main>
        );
    if (library.isPending)
        return (
            <main className={styles.page} aria-busy='true'>
                <Skeleton lines={3} />
            </main>
        );
    if (!folder)
        return (
            <main className={styles.page}>
                <EmptyState
                    title={t('texts.folder.notFound')}
                    action={
                        <Button onClick={back}>{t('texts.folder.back')}</Button>
                    }
                >
                    {t('texts.folder.notFoundHelp')}
                </EmptyState>
            </main>
        );
    const readOnly = folder.lifecycle === 'archived';
    const activeBadge = `${active.documents.length}${active.hasNextPage ? '+' : ''}`;
    const archivedBadge = `${archived.documents.length}${archived.hasNextPage ? '+' : ''}`;
    const tabs = [
        {
            value: 'active',
            label: t('texts.folder.texts'),
            ...(active.isSuccess ? { badge: activeBadge } : {}),
        },
        {
            value: 'archived',
            label: t('texts.library.archived'),
            ...(archived.isSuccess ? { badge: archivedBadge } : {}),
        },
    ];
    const restoreError =
        library.restore.isError ||
        active.restore.isError ||
        archived.restore.isError;

    return (
        <main className={styles.page}>
            <FolderHeader
                folder={folder}
                pending={library.restore.isPending}
                onAction={folderAction}
                onRestore={restoreFolder}
            />
            <Tabs
                className={styles.tabs!}
                variant='underline'
                size='sm'
                aria-label={t('texts.folder.texts')}
                value={view}
                onValueChange={changeView}
                items={tabs}
            />
            <FolderTextList
                folderId={folderId}
                list={list}
                view={view}
                readOnly={readOnly}
                shared={!!folder.isShared}
                restoreError={restoreError}
                onAction={textAction}
                onRestore={restoreText}
                onPreview={preview}
            />
            <FolderDialogs
                folder={folder}
                dialog={dialog}
                onClose={close}
                onSaved={saved}
                onFolderArchived={folderArchived}
                onChanged={library.refresh}
                requestWithSession={requestWithSession}
            />
        </main>
    );
}
