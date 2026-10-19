'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { useSessionStore } from '@/fsd/entities/session';
import { useAuth } from '@/fsd/features/auth';
import { TextReading } from '@/fsd/features/text-reading';
import {
    ArchiveTextDialog,
    RenameTextDialog,
    TextShareDialog,
    TextsAuthBoundary,
} from '@/fsd/features/text-management';
import { Button, Dialog, CompanionLayout } from '@/fsd/shared/ui';
import { ContextualAssistant } from '@/fsd/widgets/contextual-assistant';
import { useTextWorkspace } from '../../hooks/use-text-workspace';
import { workspaceReadingDocument } from '../../lib/workspace-reading';
import { WorkspaceHeader } from './workspace-header';
import { WorkspaceActions } from './workspace-actions';
import { WorkspaceBanners } from './workspace-banners';
import { WorkspaceCompose } from './workspace-compose';
import {
    WorkspaceConfirm,
    type WorkspaceConfirmation,
} from './workspace-confirm';
import { WorkspaceLanguages } from './workspace-languages';
import { WorkspacePairEditor } from './workspace-pair-editor';
import { useWorkspaceCopy } from './workspace-copy';
import styles from './workspace-page.module.css';

export function TextWorkspacePage({
    folderId,
    textId,
}: {
    folderId: string;
    textId?: string;
}) {
    const actorId = useSessionStore((state) => state.user?.id);

    return (
        <TextsAuthBoundary
            returnTo={`/texts/folders/${folderId}/${textId ? `texts/${textId}` : 'new'}`}
        >
            <Workspace
                key={`${actorId}/${folderId}/${textId ?? 'new'}`}
                actorId={actorId ?? ''}
                folderId={folderId}
                {...(textId ? { textId } : {})}
            />
        </TextsAuthBoundary>
    );
}

function Workspace({
    actorId,
    folderId,
    textId,
}: {
    actorId: string;
    folderId: string;
    textId?: string;
}) {
    const { requestWithSession } = useAuth();
    const router = useRouter();
    const { copy } = useWorkspaceCopy();
    const ws = useTextWorkspace(folderId, textId, requestWithSession, actorId);
    useEffect(() => {
        if (!textId && ws.document && !ws.unsaved)
            router.replace(
                `/texts/folders/${folderId}/texts/${ws.document.id}`,
            );
    }, [textId, ws.document, ws.unsaved, folderId, router]);
    const [confirmation, setConfirmation] =
        useState<WorkspaceConfirmation>(null);
    const [management, setManagement] = useState<
        'rename' | 'share' | 'archive' | null
    >(null);
    const [match, setMatch] = useState(false);

    function leave() {
        router.push(`/texts/folders/${folderId}`);
    }

    function close() {
        if (ws.saving) return;
        if (ws.unsaved || (ws.aiActive ?? ws.translation.active))
            setConfirmation('close');
        else leave();
    }

    function dismissConfirmation() {
        if (!ws.saving) setConfirmation(null);
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

    function review() {
        setConfirmation('conflict');
    }

    const proposal = ws.proposal;
    const { readingDocument, readingSource } = workspaceReadingDocument(ws);
    const loading =
        ws.folder.isPending || Boolean(textId && ws.remote.isPending);
    const missing =
        !loading &&
        (!ws.folder.data ||
            Boolean(
                textId &&
                (ws.remote.isError ||
                    ws.document?.folderId !== folderId ||
                    ws.document.lifecycle !== 'active'),
            ));
    const ready = !loading && !missing;
    const displayTitle = ws.input.title.trim() || copy('new');
    const showRead =
        Boolean(readingDocument?.alignment) &&
        (ws.mode === 'read' || Boolean(proposal));
    const showCompose = !showRead && ws.mode !== 'edit';
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
        <Dialog
            open
            onClose={close}
            title={displayTitle}
            size='viewport'
            showHeader={false}
            className={styles.viewport}
            bodyClassName={styles.viewportBody}
            dismissOnOverlayClick={false}
            dismissible={!ws.saving}
            dismissOnEscape={!confirmation && !management}
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
                    onRetranslate={retranslate}
                />
                {loading && <p role='status'>{copy('loading')}</p>}
                {missing && (
                    <div className={styles.editor}>
                        <h2>{copy('missing')}</h2>
                        <Button onClick={leave}>{copy('back')}</Button>
                    </div>
                )}
                {ready && (
                    <>
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
                        <main className={styles.body} id='reader-workspace'>
                            {showCompose && <WorkspaceCompose ws={ws} />}
                            {ws.mode === 'edit' && !proposal && (
                                <>
                                    <WorkspaceBanners ws={ws} />
                                    <WorkspacePairEditor ws={ws} />
                                </>
                            )}
                            {showRead && readingDocument && (
                                <TextReading
                                    collectionActorKey={actorId}
                                    document={readingDocument}
                                    source={readingSource}
                                    requestWithSession={ws.requestWithSession}
                                    matchMode={match}
                                    previewExpired={ws.previewExpired}
                                    topSlot={<WorkspaceBanners ws={ws} />}
                                />
                            )}
                        </main>
                        <div className={styles.bottom}>{actions}</div>
                    </>
                )}
                <WorkspaceConfirm
                    kind={confirmation}
                    ws={ws}
                    onClose={dismissConfirmation}
                    onLeave={leave}
                />
                {ws.document && (
                    <>
                        <RenameTextDialog
                            open={management === 'rename'}
                            document={ws.document}
                            onClose={closeManagement}
                            onSaved={ws.updateMetadata}
                            requestWithSession={ws.requestWithSession}
                        />
                        <ArchiveTextDialog
                            open={management === 'archive'}
                            kind='text'
                            resource={ws.document}
                            onClose={closeManagement}
                            onSaved={leave}
                            requestWithSession={ws.requestWithSession}
                        />
                        <TextShareDialog
                            open={management === 'share'}
                            kind='text'
                            resource={ws.document}
                            onClose={closeManagement}
                            onChanged={ws.refreshMetadata}
                            requestWithSession={ws.requestWithSession}
                        />
                    </>
                )}
            </CompanionLayout>
        </Dialog>
    );
}
