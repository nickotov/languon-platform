'use client';
import { useState, type ChangeEvent } from 'react';
import type { ConversationTurn, CopiedAttachment } from '@languon/contracts';
import { conversationApi, conversationCopy } from '@/fsd/entities/conversation';
import { useAuth } from '@/fsd/features/auth';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, Dialog, LoadingState } from '@/fsd/shared/ui';
import { useConversation } from '../../hooks/use-conversation';
import { ConversationMessages } from './conversation-messages';
import { ConversationComposer } from './conversation-composer';
import { ContextPicker } from './context-picker';
import { KnowledgeDraftCard } from './knowledge-draft-card';
import { ConversationModel } from './conversation-model';
import styles from './contextual-assistant.module.css';
import { ConversationErrorNotice } from './conversation-error-notice';
import { ConversationHistory } from './conversation-history';
import { AssistantDialogs } from './assistant-dialogs';
import { useAssistantNavigation } from '../../hooks/use-assistant-navigation';

import type { ContextualAssistantProps } from '../../types';

export function AssistantPanel({
    source,
    contextLabel,
    shareKey,
    currentDraft,
    actorId,
    passage,
    onClose,
}: ContextualAssistantProps & {
    actorId: string;
    passage: string | null;
    onClose(): void;
}) {
    const { requestWithSession } = useAuth();
    const { locale, formatDate } = useI18n();
    const { navigation, draftDirty, discardRevision } =
        useAssistantNavigation();
    function close() {
        navigation.request(onClose);
    }
    const copy = conversationCopy(locale);
    const chat = useConversation(actorId, source, requestWithSession, shareKey);
    const [picker, setPicker] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [localError, setLocalError] = useState(false);
    const [defaultsSaved, setDefaultsSaved] = useState(false);
    const [passageAttached, setPassageAttached] = useState(false);
    const detail = chat.detail.data;
    const preferences = detail?.conversation.preferences;
    const options =
        chat.list.data?.conversations.map((conversation) => ({
            value: conversation.id,
            label: formatDate(conversation.updatedAt),
        })) ?? [];
    const busy = chat.create.isPending || chat.submit.isPending;
    const unavailable =
        chat.stream.unavailable || chat.detail.isError || chat.list.isError;
    const error =
        localError ||
        chat.actionError ||
        chat.submit.isError ||
        chat.create.isError;
    function select(event: ChangeEvent<HTMLSelectElement>) {
        const next = event.target.value;
        navigation.request(() => chat.select(next));
    }
    function create() {
        navigation.request(() => chat.create.mutate());
    }
    function remove() {
        setDeleting(true);
    }
    function cancelDelete() {
        setDeleting(false);
    }
    async function confirmDelete() {
        try {
            await chat.remove();
            setDeleting(false);
        } catch {
            setLocalError(true);
        }
    }
    function send() {
        chat.submit.mutate({
            content: chat.question,
            draftContext: chat.useDraft ? currentDraft : undefined,
        });
    }
    function propose() {
        chat.submit.mutate({ content: copy.proposeQuestion });
    }
    function retry(turn: ConversationTurn) {
        const message = detail?.messages.find(
            (item) => item.turnId === turn.id && item.role === 'user',
        );
        if (message)
            chat.submit.mutate({ content: message.content, retryOf: turn.id });
    }
    async function context() {
        try {
            if (!chat.id) await chat.create.mutateAsync();
            setPicker((value) => !value);
        } catch {
            setLocalError(true);
        }
    }
    function attach(attachment: CopiedAttachment) {
        chat.setAttachments((previous) =>
            previous.length < 10 ? [...previous, attachment] : previous,
        );
    }
    function removeAttachment(id: string) {
        chat.setAttachments((previous) =>
            previous.filter((item) => item.id !== id),
        );
    }
    function attachPassage() {
        if (passage) {
            attach({
                id: crypto.randomUUID(),
                label: copy.selection,
                content: passage,
            });
            setPassageAttached(true);
        }
    }
    async function defaults() {
        if (!preferences) return;
        try {
            await requestWithSession((token) =>
                conversationApi.saveDefaults(token, preferences),
            );
            setDefaultsSaved(true);
        } catch {
            setLocalError(true);
        }
    }
    function retrySubmission() {
        if (chat.submit.variables) chat.submit.mutate(chat.submit.variables);
        else reload();
    }
    function reload() {
        void chat.stream.reconnect();
        void chat.refresh();
    }
    return (
        <Dialog
            open
            onClose={close}
            title={copy.title}
            description={contextLabel}
            closeLabel={copy.close}
            className={styles.panel}
            bodyClassName={styles.body}
        >
            <ConversationModel actorId={actorId} request={requestWithSession} />
            <ConversationHistory
                id={chat.id}
                options={options}
                busy={busy}
                onSelect={select}
                onCreate={create}
                onDelete={remove}
            />
            {(chat.list.isPending ||
                (chat.detail.isPending && Boolean(chat.id))) && (
                <LoadingState>{copy.loading}</LoadingState>
            )}
            {unavailable && (
                <ConversationErrorNotice
                    error={chat.detail.error ?? chat.list.error}
                    onRetry={reload}
                />
            )}
            {!unavailable && detail && (
                <>
                    <ConversationMessages
                        detail={detail}
                        uiMessages={chat.stream.messages}
                        active={Boolean(chat.active)}
                        onRetry={retry}
                        onPropose={propose}
                    />
                    {detail.drafts.map((draft) => (
                        <KnowledgeDraftCard
                            key={draft.id}
                            draft={draft}
                            request={requestWithSession}
                            shareKey={shareKey}
                            onChanged={chat.refresh}
                            onDirtyChange={draftDirty}
                            discardRevision={discardRevision}
                        />
                    ))}
                </>
            )}
            {!chat.id && !chat.list.isPending && !unavailable && (
                <p>{copy.empty}</p>
            )}
            {error && (
                <ConversationErrorNotice
                    error={chat.submit.error ?? chat.create.error}
                    onRetry={retrySubmission}
                />
            )}
            {chat.active && (
                <p role='status' className={styles.notice}>
                    {chat.stream.reconnecting
                        ? copy.reconnecting
                        : copy.running}
                </p>
            )}
            {!unavailable && (
                <>
                    {passage && !passageAttached && (
                        <Button variant='secondary' onClick={attachPassage}>
                            {copy.attachSelection}
                        </Button>
                    )}
                    {picker && chat.id && (
                        <ContextPicker
                            actorId={actorId}
                            conversationId={chat.id}
                            request={requestWithSession}
                            shareKey={shareKey}
                            onAttach={attach}
                        />
                    )}
                    {preferences ? (
                        <ConversationComposer
                            question={chat.question}
                            onQuestion={chat.setQuestion}
                            attachments={chat.attachments}
                            onRemove={removeAttachment}
                            preferences={preferences}
                            onPreferences={chat.updatePreferences}
                            onDefaults={defaults}
                            onContext={context}
                            onSend={send}
                            onStop={chat.stop}
                            busy={busy}
                            active={Boolean(chat.active)}
                            hasDraft={Boolean(currentDraft)}
                            useDraft={chat.useDraft}
                            onUseDraft={chat.setUseDraft}
                        />
                    ) : (
                        <Button
                            onClick={create}
                            loading={chat.create.isPending}
                        >
                            {copy.newChat}
                        </Button>
                    )}
                    {defaultsSaved && <p role='status'>{copy.saved}</p>}
                </>
            )}
            <AssistantDialogs
                navigation={navigation}
                deleting={deleting}
                onCancelDelete={cancelDelete}
                onConfirmDelete={confirmDelete}
            />
        </Dialog>
    );
}
