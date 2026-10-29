'use client';

import { type ReactNode } from 'react';
import { ArrowLeft } from 'lucide-react';
import { KnowledgeApiError } from '@/fsd/entities/knowledge';
import { useSessionStore } from '@/fsd/entities/session';
import { KnowledgeNoteForm } from '@/fsd/features/knowledge-notes';
import { ContextualAssistant } from '@/fsd/widgets/contextual-assistant';
import { useI18n } from '@/fsd/shared/i18n';
import {
    Button,
    ButtonLink,
    CompanionLayout,
    InlineAlert,
    LoadingState,
} from '@/fsd/shared/ui';
import { useKnowledgePageActions } from '../../hooks/use-knowledge-page-actions';
import { useKnowledgeLearningIntegrations } from '../../hooks/use-knowledge-learning-integrations';
import { useWorkspacePresentation } from '../../hooks/use-workspace-presentation';
import { KnowledgeAuthBoundary } from '../knowledge-auth-boundary/knowledge-auth-boundary';
import { WorkspaceDocumentPane } from './workspace-document-pane';
import { WorkspaceDialogs } from './workspace-dialogs';
import { WorkspaceNotices } from '../workspace-notices/workspace-notices';
import { WorkspaceHeader } from './workspace-header';
import { WorkspaceShareControls } from './workspace-share-controls';
import { KnowledgeMediaTools } from './knowledge-media-tools';
import styles from './knowledge-detail-page.module.css';

export function KnowledgeDetailPage({ noteId }: { noteId: string }) {
    const actorId = useSessionStore((state) => state.user?.id);
    return (
        <KnowledgeAuthBoundary returnTo={`/knowledge/${noteId}`}>
            <DetailContent key={`${actorId}:${noteId}`} noteId={noteId} />
        </KnowledgeAuthBoundary>
    );
}

function DetailContent({ noteId }: { noteId: string }) {
    const { t, href } = useI18n();
    const actions = useKnowledgePageActions(noteId);
    const integrations = useKnowledgeLearningIntegrations(noteId, actions);
    const view = useWorkspacePresentation(actions);
    const {
        state,
        workspace,
        draft,
        title,
        canSave,
        canPublish,
        busy,
        actionError,
    } = actions;
    const missing =
        state.query.error instanceof KnowledgeApiError &&
        state.query.error.status === 404;
    const back = (
        <ButtonLink
            href={href('/knowledge')}
            variant='ghost'
            leadingIcon={<ArrowLeft aria-hidden size={18} />}
        >
            {t('knowledge.back')}
        </ButtonLink>
    );
    if (!workspace && state.query.isPending)
        return (
            <main className={styles.page}>
                {back}
                <LoadingState>{t('knowledge.loading')}</LoadingState>
            </main>
        );
    if (!workspace || !draft)
        return (
            <main className={styles.page}>
                {back}
                <InlineAlert
                    tone='error'
                    actions={
                        !missing && (
                            <Button variant='secondary' onClick={actions.retry}>
                                {t('knowledge.retry')}
                            </Button>
                        )
                    }
                >
                    {t(missing ? 'knowledge.missing' : 'knowledge.loadError')}
                </InlineAlert>
            </main>
        );

    const noticeState = {
        alternatives: workspace.branches.length > 1,
        recoveryError: state.status === 'error',
        retargeting: Boolean(actions.retargetProposal),
    };
    const assistant = (
        <ContextualAssistant
            source={{ kind: 'knowledge', id: noteId }}
            contextLabel={title}
            selectionRootId='knowledge-workspace-editor'
            workspace={{
                blockProposalContext: integrations.blockProposalContext,
                getSnapshot: actions.getSnapshot,
                onBusyChange: view.setTutorBusy,
                onAcceptProposal: actions.acceptProposal,
                onConflictProposal: actions.compareProposal,
                restoreTarget: actions.restoreTarget,
                getProposalPreview: view.preview,
                onShowTarget: view.showTarget,
                proposalRootId: 'knowledge-workspace-proposal',
                inlineProposalRootId: 'knowledge-workspace-inline-proposal',
                getProposalPosition: view.proposalPosition,
                request: view.request,
                editorCharacters: view.characters,
                editorLimit: workspace.limits.editorChars,
                referenceLimit: workspace.limits.referenceChars,
                onSent: actions.refreshAfterSend,
                beforeSend: actions.beforeSend,
            }}
        />
    );
    const share =
        workspace.status === 'saved'
            ? (
                  open: boolean,
                  onOpenChange: (value: boolean) => void,
                  anchor: ReactNode,
              ) => (
                  <WorkspaceShareControls
                      noteId={noteId}
                      enabled={workspace.shareEnabled}
                      dirty={view.dirty}
                      onChange={state.setShareEnabled}
                      open={open}
                      onOpenChange={onOpenChange}
                      anchor={anchor}
                  />
              )
            : undefined;
    return (
        <CompanionLayout
            companion={assistant}
            variant='workspace'
            resizeLabel={t('knowledge.resizeTutor')}
        >
            <main className={styles.workspace} data-workspace-page>
                <WorkspaceHeader
                    title={title}
                    practiceHref={
                        workspace.published
                            ? href(`/knowledge/${noteId}/practice`)
                            : undefined
                    }
                    recovery={state.status}
                    savedAt={workspace.published?.updatedAt}
                    draft={workspace.status === 'draft'}
                    dirty={view.dirty}
                    canSave={canSave}
                    canPublish={canPublish}
                    busy={busy}
                    share={share}
                    shareEnabled={workspace.shareEnabled}
                    titleVisible={view.titleVisible}
                    saveError={Boolean(actionError)}
                    stats={
                        t('knowledge.words', { count: view.words }) +
                        ' · ' +
                        t('knowledge.tutorLimit', {
                            count: view.characters.toLocaleString(),
                            limit: workspace.limits.editorChars.toLocaleString(),
                        })
                    }
                    onSave={actions.save}
                    onSaveCopy={actions.saveCopy}
                    onHistory={actions.openHistory}
                    onDelete={actions.openDelete}
                    onRetryRecovery={state.retryRecovery}
                />
                <WorkspaceDocumentPane>
                    <div
                        id='knowledge-workspace-toolbar'
                        className={styles.formatting}
                    />
                    <div
                        className={styles.documentScroll}
                        data-workspace-scroll
                    >
                        <WorkspaceNotices
                            alternatives={noticeState.alternatives}
                            recoveryError={noticeState.recoveryError}
                            actionError={actionError}
                            retargeting={noticeState.retargeting}
                            onRetryRecovery={state.retryRecovery}
                            onCancelRetarget={actions.cancelRetarget}
                            onApplyRetarget={actions.applyRetarget}
                        />
                        <WorkspaceDialogs actions={actions} />
                        <KnowledgeNoteForm
                            ref={actions.editor}
                            value={draft.content}
                            onChange={state.change}
                            onValidityChange={actions.setValid}
                            disabled={busy !== null}
                            workspace={{
                                preparationTools: (
                                    <KnowledgeMediaTools
                                        narration={integrations.narration}
                                        transcription={
                                            integrations.transcription
                                        }
                                    />
                                ),
                                toolbarRootId: 'knowledge-workspace-toolbar',
                                uploadAudio: integrations.uploadAudio,
                                library: integrations.library,
                                blockCopy: integrations.blockCopy,
                                editorId: 'knowledge-workspace-editor',
                                proposalRootId: 'knowledge-workspace-proposal',
                                inlineProposalRootId:
                                    'knowledge-workspace-inline-proposal',
                                onAskTutor: view.askTutor,
                                onTutorAction: view.tutorAction,
                                tutorBusy: view.tutorBusy,
                                onTitleVisibilityChange: view.setTitleVisible,
                                onAskOutline: view.askOutline,
                            }}
                        />
                    </div>
                </WorkspaceDocumentPane>
            </main>
        </CompanionLayout>
    );
}
