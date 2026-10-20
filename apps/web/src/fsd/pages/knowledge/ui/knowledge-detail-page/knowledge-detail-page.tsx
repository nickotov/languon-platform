'use client';

import { ArrowLeft } from 'lucide-react';
import { KnowledgeApiError } from '@/fsd/entities/knowledge';
import { useSessionStore } from '@/fsd/entities/session';
import { KnowledgeNoteForm } from '@/fsd/features/knowledge-notes';
import { ContextualAssistant } from '@/fsd/widgets/contextual-assistant';
import { useI18n } from '@/fsd/shared/i18n';
import {
    AlertDialog,
    Button,
    ButtonLink,
    CompanionLayout,
    DialogActions,
    InlineAlert,
    LoadingState,
} from '@/fsd/shared/ui';
import { useKnowledgePageActions } from '../../hooks/use-knowledge-page-actions';
import { KnowledgeAuthBoundary } from '../knowledge-auth-boundary/knowledge-auth-boundary';
import { WorkspaceConflictDialogs } from './workspace-conflict-dialogs';
import { WorkspaceHeader } from './workspace-header';
import { WorkspaceHistory } from './workspace-history';
import { WorkspaceShareControls } from './workspace-share-controls';
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
    const {
        state,
        workspace,
        draft,
        title,
        canSave,
        canPublish,
        busy,
        actionError,
        navigation,
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

    const assistant = (
        <ContextualAssistant
            source={{ kind: 'knowledge', id: noteId }}
            contextLabel={title}
            workspace={{
                getSnapshot: actions.getSnapshot,
                onAcceptProposal: actions.acceptProposal,
                onConflictProposal: actions.compareProposal,
                restoreTarget: actions.restoreTarget,
                editorLimit: workspace.limits.editorChars,
                referenceLimit: workspace.limits.referenceChars,
                onSent: actions.refreshAfterSend,
                beforeSend: actions.beforeSend,
            }}
        />
    );

    return (
        <CompanionLayout companion={assistant}>
            <main className={styles.page}>
                {back}
                <WorkspaceHeader
                    title={title}
                    recovery={state.status}
                    draft={workspace.status === 'draft'}
                    canSave={canSave}
                    busy={busy}
                    onSaveCopy={actions.saveCopy}
                    onHistory={actions.openHistory}
                    onDelete={actions.openDelete}
                />
                {state.status === 'error' && (
                    <InlineAlert
                        tone='error'
                        actions={
                            <Button onClick={state.retryRecovery}>
                                {t('knowledge.retry')}
                            </Button>
                        }
                    >
                        {t('knowledge.recoveryError')}
                    </InlineAlert>
                )}
                {actionError && (
                    <InlineAlert tone='error'>
                        {t('knowledge.saveError')}
                    </InlineAlert>
                )}
                {actions.retargetProposal && (
                    <InlineAlert
                        tone='warning'
                        actions={
                            <div className={styles.actions}>
                                <Button
                                    variant='secondary'
                                    onClick={actions.cancelRetarget}
                                >
                                    {t('knowledge.cancel')}
                                </Button>
                                <Button onClick={actions.applyRetarget}>
                                    {t('knowledge.applyNewTarget')}
                                </Button>
                            </div>
                        }
                    >
                        {t('knowledge.retargetHelp')}
                    </InlineAlert>
                )}
                <section
                    className={styles.article}
                    id='knowledge-workspace-editor'
                >
                    <KnowledgeNoteForm
                        ref={actions.editor}
                        value={draft.content}
                        onChange={state.change}
                        onValidityChange={actions.setValid}
                        disabled={busy !== null}
                    />
                    <div className={styles.saveActions}>
                        <span className={styles.description}>
                            {workspace.branches.length > 1
                                ? t('knowledge.resolveBeforeSave')
                                : workspace.status === 'draft'
                                  ? t('knowledge.draftHelp')
                                  : t('knowledge.saveHelp')}
                        </span>
                        <Button
                            disabled={!canPublish || busy !== null}
                            loading={busy === 'save'}
                            onClick={actions.save}
                        >
                            {t('knowledge.save')}
                        </Button>
                    </div>
                </section>
                {workspace.status === 'saved' && (
                    <WorkspaceShareControls
                        noteId={noteId}
                        enabled={workspace.shareEnabled}
                        onChange={state.setShareEnabled}
                    />
                )}
                <WorkspaceConflictDialogs
                    workspace={workspace}
                    selectedBranchId={draft.branchId}
                    onChoose={actions.chooseBranch}
                    onSaveCopy={actions.saveCopy}
                    onResolve={actions.resolveBranches}
                    resolving={busy === 'resolve'}
                    proposal={actions.proposalConflict}
                    editor={actions.editor}
                    onCloseProposal={actions.closeProposal}
                    onNewTarget={actions.beginRetarget}
                />
                <WorkspaceHistory
                    noteId={noteId}
                    open={actions.historyOpen}
                    publishedVersion={workspace.published?.version ?? 0}
                    onClose={actions.closeHistory}
                    onBeforeRestore={state.flush}
                    onRestored={state.reload}
                />
                <AlertDialog
                    open={actions.deleting}
                    onClose={actions.closeDelete}
                    title={t('knowledge.deleteTitle')}
                    closeLabel={t('knowledge.cancelDelete')}
                    footer={
                        <DialogActions>
                            <Button
                                variant='secondary'
                                onClick={actions.closeDelete}
                            >
                                {t('knowledge.cancelDelete')}
                            </Button>
                            <Button
                                variant='danger'
                                loading={busy === 'delete'}
                                onClick={actions.remove}
                            >
                                {t('knowledge.delete')}
                            </Button>
                        </DialogActions>
                    }
                >
                    <p>{t('knowledge.deleteHelp')}</p>
                </AlertDialog>
                <AlertDialog
                    open={navigation.open}
                    onClose={navigation.keepEditing}
                    title={t('knowledge.unsavedTitle')}
                    closeLabel={t('knowledge.keepEditing')}
                    footer={
                        <DialogActions>
                            <Button
                                variant='secondary'
                                onClick={navigation.keepEditing}
                            >
                                {t('knowledge.keepEditing')}
                            </Button>
                            <Button
                                variant='danger'
                                onClick={navigation.discard}
                            >
                                {t('knowledge.discard')}
                            </Button>
                        </DialogActions>
                    }
                >
                    <p>{t('knowledge.unsavedHelp')}</p>
                </AlertDialog>
            </main>
        </CompanionLayout>
    );
}
