'use client';

import { useEffect, useState, type ChangeEvent } from 'react';
import type { MoveTextRequest } from '@languon/contracts';
import { useI18n } from '@/fsd/shared/i18n';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { useAuth } from '@/fsd/features/auth';
import { Button, CompanionLayout, InlineAlert } from '@/fsd/shared/ui';
import { useDirtyNavigation } from '@/fsd/shared/lib/navigation/use-dirty-navigation';
import { useRecordResourceOpen } from '@/fsd/features/library-navigation';
import { ContextualAssistant } from '@/fsd/widgets/contextual-assistant';
import { useTextWorkspace } from '../../hooks/use-text-workspace';
import { WorkspaceHeader } from './workspace-header';
import { WorkspaceActions } from './workspace-actions';
import {
    WorkspaceConfirm,
    type WorkspaceConfirmation,
} from './workspace-confirm';
import { WorkspaceLanguages } from './workspace-languages';
import { WorkspaceDocument } from './workspace-document';
import {
    WorkspaceManagement,
    type WorkspaceManagementKind,
} from './workspace-management';
import { useWorkspaceCopy } from './workspace-copy';
import styles from './workspace-page.module.css';

export function TextWorkspace({
    actorId,
    folderId,
    textId,
    sharedFolderConfirmation,
}: {
    sharedFolderConfirmation?: MoveTextRequest['sharedFolderConfirmation'];
    actorId: string;
    folderId: string | null;
    textId?: string;
}) {
    const { requestWithSession } = useAuth();
    const router = useRouter();
    const { copy } = useWorkspaceCopy();
    const { t } = useI18n();
    const [folderConsent, setFolderConsent] = useState(
        sharedFolderConfirmation,
    );
    const ws = useTextWorkspace(
        folderId,
        textId,
        requestWithSession,
        actorId,
        folderConsent,
    );
    const sharedNew = !ws.document && Boolean(ws.folder.data?.isShared);
    const consentValid = Boolean(
        folderConsent &&
        folderConsent.shareId === ws.folder.data?.shareId &&
        folderConsent.shareVersion === ws.folder.data?.shareVersion,
    );
    useEffect(() => {
        if (ws.folder.data && !ws.folder.data.isShared)
            setFolderConsent(undefined);
    }, [ws.folder.data]);
    function consent(event: ChangeEvent<HTMLInputElement>) {
        const folder = ws.folder.data;
        if (
            event.target.checked &&
            folder?.shareId &&
            folder.shareVersion != null
        )
            setFolderConsent({
                shareId: folder.shareId,
                shareVersion: folder.shareVersion,
            });
        else setFolderConsent(undefined);
    }
    useEffect(() => {
        if (!textId && ws.document && !ws.unsaved)
            router.replace(`/texts/${ws.document.id}`);
    }, [textId, ws.document, ws.unsaved, folderId, router]);
    const [confirmation, setConfirmation] =
        useState<WorkspaceConfirmation>(null);
    const [management, setManagement] = useState<WorkspaceManagementKind>(null);
    const [match, setMatch] = useState(false);

    const guard = useDirtyNavigation();
    const dirty = ws.unsaved || ws.aiActive || ws.saving;
    useEffect(() => {
        guard.setDirty(dirty);
    }, [dirty, guard.setDirty]);
    function leave() {
        const destination = ws.document?.folderId ?? folderId;
        router.push(destination ? `/texts/folders/${destination}` : '/texts');
    }
    function confirmLeave() {
        if (guard.open) guard.discard();
        else leave();
    }
    function move() {
        setManagement('move');
    }

    function close() {
        if (ws.saving) return;
        if (ws.unsaved || (ws.aiActive ?? ws.translation.active))
            setConfirmation('close');
        else leave();
    }

    function dismissConfirmation() {
        if (!ws.saving) {
            setConfirmation(null);
            guard.keepEditing();
        }
    }

    function discard() {
        setConfirmation('discard');
    }

    function cancelEdit() {
        if (ws.touched.size) setConfirmation('cancel-edit');
        else ws.cancelEdit();
    }

    function rename() {
        setManagement('rename');
    }

    function share() {
        setManagement('share');
    }

    function archive() {
        setManagement('archive');
    }

    function retranslate() {
        setConfirmation('retranslate');
    }

    function closeManagement() {
        setManagement(null);
    }

    function retryRecovery() {
        void ws.pendingJob.refetch();
    }
    function review() {
        setConfirmation('conflict');
    }

    const membership = ws.document ? ws.document.folderId : folderId;
    const loading =
        Boolean(membership && ws.folder.isPending) ||
        Boolean(
            textId &&
            (ws.remote.isPending ||
                (ws.remote.isSuccess && ws.pendingJob.isPending)),
        );
    const missing =
        !loading &&
        (Boolean(membership && !ws.folder.data) ||
            Boolean(
                textId &&
                (ws.remote.isError ||
                    ws.pendingJob.isError ||
                    ws.document?.lifecycle !== 'active'),
            ));
    const ready = !loading && !missing;
    useRecordResourceOpen(
        'text',
        textId ?? '',
        Boolean(
            ready &&
            textId &&
            ws.remote.isSuccess &&
            ws.document?.lifecycle === 'active',
        ),
        requestWithSession,
    );

    const displayTitle = ws.input.title.trim() || copy('new');
    const assistantDraft = ws.unsaved
        ? JSON.stringify({
              title: ws.input.title,
              sourceText: ws.input.sourceText,
              pairs: ws.pairs,
          })
        : undefined;
    const actions = (
        <WorkspaceActions
            ws={ws}
            onDiscard={discard}
            onCancelEdit={cancelEdit}
        />
    );

    const assistant = ws.document ? (
        <ContextualAssistant
            source={{ kind: 'text', id: ws.document.id }}
            contextLabel={displayTitle}
            currentDraft={assistantDraft}
            selectionRootId='reader-workspace'
        />
    ) : null;

    return (
        <section
            className={styles.viewport}
            aria-label={displayTitle}
            data-text-workspace
        >
            <CompanionLayout fill companion={assistant}>
                <WorkspaceHeader
                    ws={ws}
                    title={displayTitle}
                    actions={actions}
                    onClose={close}
                    onRename={rename}
                    onShare={share}
                    onArchive={archive}
                    onMove={move}
                    onRetranslate={retranslate}
                />
                {loading && <p role='status'>{copy('loading')}</p>}
                {missing && (
                    <div className={styles.editor}>
                        <h2>
                            {ws.pendingJob.isError
                                ? t('texts.library.errorTitle')
                                : copy('missing')}
                        </h2>
                        {ws.pendingJob.isError && (
                            <Button onClick={retryRecovery}>
                                {t('texts.library.retry')}
                            </Button>
                        )}
                        <Button onClick={leave}>{copy('back')}</Button>
                    </div>
                )}
                {ready && (
                    <>
                        {sharedNew && !consentValid && (
                            <InlineAlert tone='warning'>
                                <p>{t('texts.organization.sharedWarning')}</p>
                                <label>
                                    <input
                                        type='checkbox'
                                        checked={false}
                                        onChange={consent}
                                    />{' '}
                                    {t('texts.organization.confirmShared')}
                                </label>
                            </InlineAlert>
                        )}
                        <WorkspaceLanguages
                            ws={ws}
                            match={match}
                            onMatch={setMatch}
                        />
                        {ws.conflict && (
                            <Button
                                desktopIconOnly
                                onClick={review}
                                leadingIcon={<RefreshCw />}
                            >
                                {copy('review')}
                            </Button>
                        )}
                        <WorkspaceDocument
                            ws={ws}
                            actorId={actorId}
                            match={match}
                        />
                        <div className={styles.bottom}>{actions}</div>
                    </>
                )}
                <WorkspaceConfirm
                    kind={guard.open ? 'close' : confirmation}
                    ws={ws}
                    onClose={dismissConfirmation}
                    onLeave={confirmLeave}
                />
                <WorkspaceManagement
                    ws={ws}
                    kind={management}
                    onClose={closeManagement}
                    onLeave={leave}
                />
            </CompanionLayout>
        </section>
    );
}
