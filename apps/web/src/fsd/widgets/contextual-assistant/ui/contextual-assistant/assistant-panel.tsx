'use client';
import { KnowledgeBlockProposals } from '@/fsd/features/knowledge-notes';
import { conversationCopy } from '@/fsd/entities/conversation';
import { useI18n } from '@/fsd/shared/i18n';
import { LoadingState, useCompanionLayout } from '@/fsd/shared/ui';
import { usePublishedKnowledge } from '../../hooks/use-published-knowledge';
import { ConversationDeleteConfirmation } from './conversation-delete-confirmation';
import { useAssistantPanel } from '../../hooks/use-assistant-panel';
import { ConversationMessages } from './conversation-messages';
import { ConversationComposer } from './conversation-composer';
import { ContextPicker } from './context-picker';
import { WorkspaceReferencePicker } from './workspace-reference-picker';
import { PublishedNoteNotice } from './published-note-notice';
import { KnowledgeDraftCard } from './knowledge-draft-card';
import { ConversationErrorNotice } from './conversation-error-notice';
import { tutorModeCopy } from './tutor-mode-copy';
import { ConversationHistory } from './conversation-history';
import { ActionBudgetConfirmation } from './action-budget-confirmation';
import { AssistantDialogs } from './assistant-dialogs';
import { TutorShell } from '../tutor-shell/tutor-shell';
import type { ContextualAssistantProps } from '../../types';
import styles from './assistant-panel.module.css';

export function AssistantPanel(
    props: ContextualAssistantProps & {
        actorId: string;
        selectedPassage: { id: string; text: string } | null;
        folded: boolean;
        onFold(): void;
        onExpand(): void;
        onSelectFromPage(): void;
    },
) {
    const readOnlyKnowledge =
        props.source.kind === 'knowledge' &&
        (Boolean(props.source.shareLocator) || props.source.view === 'saved');
    const workspace = readOnlyKnowledge ? undefined : props.workspace;
    const currentDraft = readOnlyKnowledge ? undefined : props.currentDraft;
    const { locale, formatDate } = useI18n();
    const copy = conversationCopy(locale);
    const placement = useCompanionLayout();
    const panel = useAssistantPanel({ ...props, workspace, currentDraft });
    const { chat, detail } = panel;
    const modeCopy = tutorModeCopy(locale);
    const actionRetryLabel =
        chat.actionFailure?.kind === 'preferences'
            ? modeCopy.retrySettings
            : undefined;
    const { published, publishedNote } = usePublishedKnowledge(
        chat.id,
        panel.setEditingDraft,
    );
    const options =
        chat.list.data?.conversations.map((conversation) => ({
            value: conversation.id,
            label: conversation.title ?? formatDate(conversation.updatedAt),
            date: formatDate(conversation.updatedAt),
        })) ?? [];
    const lastTurn = detail?.turns.at(-1);
    const interrupted =
        lastTurn?.status === 'failed' || lastTurn?.status === 'cancelled';
    const editing =
        !readOnlyKnowledge &&
        Boolean(
            panel.editingDraft &&
            detail?.drafts.some((draft) => draft.id === panel.editingDraft),
        );
    const preferences = panel.preferences;
    const showContent = !panel.unavailable && Boolean(detail);
    const loading =
        chat.list.isPending ||
        (chat.detail.isPending && Boolean(chat.id)) ||
        chat.create.isPending;
    const busy = panel.busy || panel.deletingPending;
    const deletePending = Boolean(panel.deleting) && !panel.history;
    const historyDeleting = panel.history ? panel.deleting : null;
    const canSelect = Boolean(props.selectionRootId) && !workspace;
    const selectionAction = canSelect ? props.onSelectFromPage : undefined;
    function foldMobileForReview() {
        if (workspace && placement && !placement.detached) {
            if (placement.mobile) placement.setMobileTab('document');
            else if (placement.overlay) placement.setMode('focus');
            return;
        }
        if (window.matchMedia('(max-width: 1023px)').matches) props.onFold();
    }

    const blockProposalContext =
        workspace?.blockProposalContext && chat.id
            ? {
                  ...workspace.blockProposalContext,
                  requestWithSession: panel.requestWithSession,
                  conversationId: chat.id,
              }
            : undefined;
    const blockProposalRefresh = `${detail?.conversation.updatedAt ?? ''}:${lastTurn?.id ?? ''}:${lastTurn?.status ?? ''}`;
    const portrait = {
        ownerId: props.actorId,
        requestWithSession: panel.requestWithSession,
        origins: detail?.conversation.preferenceOrigins,
        onFreshChat: panel.createWithoutPortrait,
    };
    const contextPicker =
        panel.picker && chat.id ? (
            workspace ? (
                <WorkspaceReferencePicker
                    actorId={props.actorId}
                    conversationId={chat.id}
                    request={panel.requestWithSession}
                    onAttach={panel.attach}
                    onClose={panel.closePicker}
                />
            ) : (
                <ContextPicker
                    actorId={props.actorId}
                    conversationId={chat.id}
                    request={panel.requestWithSession}
                    shareKey={props.shareKey}
                    attachments={chat.attachments}
                    onAttach={panel.attach}
                    onClose={panel.closePicker}
                />
            )
        ) : undefined;
    return (
        <TutorShell
            workspace={Boolean(workspace)}
            editorCharacters={workspace?.editorCharacters}
            editorLimit={workspace?.editorLimit}
            folded={props.folded}
            onFold={props.onFold}
            onExpand={props.onExpand}
            active={panel.active}
            interrupted={interrupted}
            unread={panel.unread}
            sourceKind={props.source.kind}
            contextLabel={props.contextLabel ?? copy.source}
            hasDraft={Boolean(currentDraft) && !workspace}
            useDraft={workspace ? true : chat.useDraft}
            onUseDraft={chat.setUseDraft}
            onNew={panel.create}
            onHistory={panel.toggleHistory}
            onDelete={panel.remove}
            busy={busy}
            canDelete={Boolean(chat.id)}
            unavailable={panel.unavailable}
        >
            <div className={styles.content}>
                {loading && (
                    <div className={styles.notice}>
                        <LoadingState>{copy.loading}</LoadingState>
                    </div>
                )}
                {panel.unavailable && (
                    <div className={styles.notice}>
                        <ConversationErrorNotice
                            error={chat.detail.error ?? chat.list.error}
                            onRetry={panel.reload}
                        />
                    </div>
                )}
                {deletePending && (
                    <ConversationDeleteConfirmation
                        pending={panel.deletingPending}
                        onConfirm={panel.confirmDelete}
                        onCancel={panel.cancelDelete}
                    />
                )}
                <div
                    className={styles.view}
                    hidden={!panel.history || panel.unavailable}
                >
                    <ConversationHistory
                        id={chat.id}
                        options={options}
                        busy={busy}
                        sourceLabel={props.contextLabel}
                        onSelect={panel.select}
                        onCreate={panel.create}
                        onDelete={panel.deleteFromHistory}
                        onRename={chat.rename}
                        onBack={panel.backToChat}
                        deleting={historyDeleting}
                        deletingPending={panel.deletingPending}
                        onConfirmDelete={panel.confirmDelete}
                        onCancelDelete={panel.cancelDelete}
                    />
                </div>
                <div
                    className={styles.view}
                    hidden={panel.history || panel.unavailable}
                >
                    {showContent && detail && (
                        <ConversationMessages
                            detail={detail}
                            sourceKind={props.source.kind}
                            contextLabel={props.contextLabel}
                            uiMessages={chat.stream.messages}
                            active={panel.active}
                            pending={chat.submit.isPending}
                            onRetry={panel.retry}
                            onContinue={panel.continueResponse}
                            onPropose={
                                readOnlyKnowledge ? undefined : panel.propose
                            }
                            onAcceptWorkspaceProposal={
                                workspace ? panel.acceptProposal : undefined
                            }
                            workspaceTargets={panel.proposalTargets}
                            onSuggest={chat.setQuestion}
                            proposalRootId={workspace?.proposalRootId}
                            onReviewProposal={foldMobileForReview}
                            workspace={workspace}
                        >
                            {!readOnlyKnowledge &&
                                detail.drafts.map((draft) => (
                                    <KnowledgeDraftCard
                                        key={draft.id}
                                        draft={draft}
                                        request={panel.requestWithSession}
                                        shareKey={props.shareKey}
                                        onChanged={chat.refresh}
                                        onDirtyChange={panel.draftDirty}
                                        discardRevision={panel.discardRevision}
                                        expanded={
                                            panel.editingDraft === draft.id
                                        }
                                        onOpen={panel.setEditingDraft}
                                        onBack={panel.backToChat}
                                        onPublished={publishedNote}
                                    />
                                ))}
                            {!readOnlyKnowledge && blockProposalContext && (
                                <KnowledgeBlockProposals
                                    context={blockProposalContext}
                                    refreshKey={blockProposalRefresh}
                                    active={panel.active}
                                />
                            )}
                            {!readOnlyKnowledge && published && (
                                <PublishedNoteNotice note={published} />
                            )}
                        </ConversationMessages>
                    )}
                    {panel.error && !chat.quote && (
                        <div className={styles.notice}>
                            <ConversationErrorNotice
                                error={panel.error}
                                onRetry={panel.retrySubmission}
                            />
                        </div>
                    )}
                    <ActionBudgetConfirmation
                        quote={chat.quote}
                        onSend={chat.confirmQuote}
                        onClose={chat.cancelQuote}
                    />
                    {chat.actionError && (
                        <div
                            className={styles.notice}
                            data-tutor-action-error={chat.actionFailure?.kind}
                        >
                            <ConversationErrorNotice
                                error={chat.actionFailure?.error}
                                onRetry={chat.retryAction}
                                retryLabel={actionRetryLabel}
                                disabled={busy}
                            />
                        </div>
                    )}
                    {panel.defaultsFailure && (
                        <div
                            className={styles.notice}
                            data-tutor-defaults-error
                        >
                            <ConversationErrorNotice
                                error={panel.defaultsFailure.error}
                                onRetry={panel.retryDefaults}
                                retryLabel={modeCopy.retrySettings}
                                disabled={busy}
                            />
                        </div>
                    )}
                    {chat.stream.reconnecting && (
                        <p className={styles.reconnecting} role='status'>
                            {copy.reconnecting}
                        </p>
                    )}
                    <div hidden={editing} className={styles.composer}>
                        {panel.attachmentError && (
                            <p role='alert' className={styles.notice}>
                                {panel.attachmentError}
                            </p>
                        )}
                        {preferences && (
                            <ConversationComposer
                                question={chat.question}
                                onQuestion={chat.setQuestion}
                                attachments={chat.attachments}
                                onRemove={panel.removeAttachment}
                                preferences={preferences}
                                portrait={portrait}
                                onPreferences={panel.updatePreferences}
                                onDefaults={panel.defaults}
                                defaultsSaved={panel.defaultsSaved}
                                onContext={panel.context}
                                onSend={panel.send}
                                onStop={chat.stop}
                                busy={busy}
                                active={panel.active}
                                hasDraft={Boolean(currentDraft)}
                                useDraft={chat.useDraft}
                                onUseDraft={chat.setUseDraft}
                                contextPicker={contextPicker}
                                contextOpen={panel.picker}
                                onSelectFromPage={selectionAction}
                                workspace={Boolean(workspace)}
                                editorCharacters={workspace?.editorCharacters}
                                editorLimit={workspace?.editorLimit}
                                workspacePassage={panel.workspacePassage}
                                onRemoveWorkspacePassage={
                                    panel.removeWorkspacePassage
                                }
                            />
                        )}
                    </div>
                    {panel.defaultsSaved && (
                        <span role='status' className={styles.srOnly}>
                            {copy.saved}
                        </span>
                    )}
                </div>
            </div>
            <AssistantDialogs
                navigation={panel.navigation}
                deleting={false}
                onCancelDelete={panel.cancelDelete}
                onConfirmDelete={panel.confirmDelete}
            />
        </TutorShell>
    );
}
