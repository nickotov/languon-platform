'use client';
import { conversationCopy } from '@/fsd/entities/conversation';
import { useI18n } from '@/fsd/shared/i18n';
import { LoadingState } from '@/fsd/shared/ui';
import { usePublishedKnowledge } from '../../hooks/use-published-knowledge';
import { ConversationDeleteConfirmation } from './conversation-delete-confirmation';
import { useAssistantPanel } from '../../hooks/use-assistant-panel';
import { ConversationMessages } from './conversation-messages';
import { ConversationComposer } from './conversation-composer';
import { ContextPicker } from './context-picker';
import { PublishedNoteNotice } from './published-note-notice';
import { KnowledgeDraftCard } from './knowledge-draft-card';
import { ConversationModel } from './conversation-model';
import { ConversationErrorNotice } from './conversation-error-notice';
import { ConversationHistory } from './conversation-history';
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
    const { locale, formatDate } = useI18n();
    const copy = conversationCopy(locale);
    const panel = useAssistantPanel(props);
    const { chat, detail } = panel;
    const { published, publishedNote } = usePublishedKnowledge(
        chat.id,
        panel.setEditingDraft,
    );
    const options =
        chat.list.data?.conversations.map((conversation) => ({
            value: conversation.id,
            label: formatDate(conversation.updatedAt),
            date: props.contextLabel ?? copy.history,
        })) ?? [];
    const lastTurn = detail?.turns.at(-1);
    const interrupted =
        lastTurn?.status === 'failed' || lastTurn?.status === 'cancelled';
    const editing = Boolean(
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
    const canSelect = Boolean(props.selectionRootId);
    const selectionAction = canSelect ? props.onSelectFromPage : undefined;
    const modelControl = (
        <ConversationModel
            actorId={props.actorId}
            request={panel.requestWithSession}
        />
    );
    const contextPicker =
        panel.picker && chat.id ? (
            <ContextPicker
                actorId={props.actorId}
                conversationId={chat.id}
                request={panel.requestWithSession}
                shareKey={props.shareKey}
                attachments={chat.attachments}
                onAttach={panel.attach}
                onClose={panel.closePicker}
            />
        ) : undefined;
    return (
        <TutorShell
            folded={props.folded}
            onFold={props.onFold}
            onExpand={props.onExpand}
            active={panel.active}
            interrupted={interrupted}
            unread={panel.unread}
            sourceKind={props.source.kind}
            contextLabel={props.contextLabel ?? copy.source}
            hasDraft={Boolean(props.currentDraft)}
            useDraft={chat.useDraft}
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
                            onPropose={panel.propose}
                            onSuggest={chat.setQuestion}
                        >
                            {detail.drafts.map((draft) => (
                                <KnowledgeDraftCard
                                    key={draft.id}
                                    draft={draft}
                                    request={panel.requestWithSession}
                                    shareKey={props.shareKey}
                                    onChanged={chat.refresh}
                                    onDirtyChange={panel.draftDirty}
                                    discardRevision={panel.discardRevision}
                                    expanded={panel.editingDraft === draft.id}
                                    onOpen={panel.setEditingDraft}
                                    onBack={panel.backToChat}
                                    onPublished={publishedNote}
                                />
                            ))}
                            {published && (
                                <PublishedNoteNotice note={published} />
                            )}
                        </ConversationMessages>
                    )}
                    {panel.error && (
                        <div className={styles.notice}>
                            <ConversationErrorNotice
                                error={panel.error}
                                onRetry={panel.retrySubmission}
                            />
                        </div>
                    )}
                    {chat.actionError && (
                        <div className={styles.notice}>
                            <ConversationErrorNotice onRetry={panel.reload} />
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
                                onPreferences={chat.updatePreferences}
                                onDefaults={panel.defaults}
                                onContext={panel.context}
                                onSend={panel.send}
                                onStop={chat.stop}
                                busy={busy}
                                active={panel.active}
                                hasDraft={Boolean(props.currentDraft)}
                                useDraft={chat.useDraft}
                                onUseDraft={chat.setUseDraft}
                                modelControl={modelControl}
                                contextPicker={contextPicker}
                                contextOpen={panel.picker}
                                onSelectFromPage={selectionAction}
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
