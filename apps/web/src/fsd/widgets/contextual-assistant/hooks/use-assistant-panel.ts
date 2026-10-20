import { useCallback, useEffect, useRef, useState } from 'react';
import type {
    ConversationEditorTarget,
    ConversationTurn,
    CopiedAttachment,
} from '@languon/contracts';
import {
    conversationApi,
    conversationCopy,
    type ConversationUIMessage,
} from '@/fsd/entities/conversation';
import { useAuth } from '@/fsd/features/auth';
import { useI18n } from '@/fsd/shared/i18n';
import { showToast } from '@/fsd/shared/ui';
import { useConversation } from './use-conversation';
import { useAssistantNavigation } from './use-assistant-navigation';
import { useConversationDeletion } from './use-conversation-deletion';
import type { ContextualAssistantProps } from '../types';
import {
    appendAssistantAttachment,
    knowledgeProposalQuestion,
} from '../lib/assistant-input';

async function hashEditorContent(content: string): Promise<string> {
    const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(content),
    );
    return Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, '0'),
    ).join('');
}

export function useAssistantPanel(
    props: ContextualAssistantProps & {
        actorId: string;
        folded: boolean;
        selectedPassage: { id: string; text: string } | null;
    },
) {
    const { requestWithSession } = useAuth();
    const { locale } = useI18n();
    const copy = conversationCopy(locale);
    const chat = useConversation(
        props.actorId,
        props.source,
        requestWithSession,
        props.shareKey,
    );
    const { navigation, draftDirty, discardRevision } =
        useAssistantNavigation();
    const [history, setHistory] = useState(false);
    const [picker, setPicker] = useState(false);
    const [editingDraft, setEditingDraft] = useState<string | null>(null);
    const [localError, setLocalError] = useState<unknown>(null);
    const deletion = useConversationDeletion({
        remove: chat.remove,
        onDeleted: closeDeletedDraft,
        onError: setLocalError,
    });
    const {
        deleting,
        deletingPending,
        requestDelete: deleteFromHistory,
        cancelDelete,
        confirmDelete,
    } = deletion;
    function closeDeletedDraft() {
        setEditingDraft(null);
    }
    const [defaultsSaved, setDefaultsSaved] = useState(false);
    const [attachmentError, setAttachmentError] = useState<string | null>(null);
    const [preparing, setPreparing] = useState(false);
    const preparationLock = useRef(false);
    const preparationFailed = useRef(false);
    const attachmentSnapshot = useRef(chat.attachments);
    const [proposalTargets, setProposalTargets] = useState(
        () => new Map<string, string>(),
    );
    attachmentSnapshot.current = chat.attachments;
    const attach = useCallback(
        (attachment: CopiedAttachment) => {
            const result = appendAssistantAttachment(
                attachmentSnapshot.current,
                attachment,
                locale,
                props.workspace?.referenceLimit,
            );
            attachmentSnapshot.current = result.attachments;
            chat.setAttachments(result.attachments);
            setAttachmentError(result.error);
            if (result.error && props.workspace)
                showToast({
                    content: result.error,
                    dismissLabel: 'Dismiss',
                    tone: 'warning',
                });
            return !result.error;
        },
        [chat.setAttachments, locale, props.workspace],
    );
    const initialized = useRef(false);
    const lastPassage = useRef<string | null>(null);
    const [unread, setUnread] = useState(false);
    const active = Boolean(chat.active);
    const wasActive = useRef(active);
    const busy = chat.create.isPending || chat.submit.isPending || preparing;
    const detail = chat.detail.data;
    const preferences = detail?.conversation.preferences;
    const unavailable =
        chat.stream.unavailable || chat.detail.isError || chat.list.isError;

    useEffect(() => {
        if (
            !props.folded &&
            !chat.id &&
            chat.list.isSuccess &&
            !initialized.current
        ) {
            initialized.current = true;
            chat.create.mutate();
        }
    }, [props.folded, chat.id, chat.list.isSuccess, chat.create.mutate]);
    useEffect(() => {
        if (!props.folded) setUnread(false);
        else if (wasActive.current && !active) setUnread(true);
        wasActive.current = active;
    }, [active, props.folded]);
    useEffect(() => {
        setAttachmentError(null);
    }, [chat.id]);
    useEffect(() => {
        const passage = props.selectedPassage;
        if (!passage || passage.id === lastPassage.current) return;
        lastPassage.current = passage.id;
        attach({
            id: passage.id,
            label: copy.selection,
            content: passage.text,
        });
    }, [props.selectedPassage, copy.selection, attach]);

    function select(id: string) {
        navigation.request(() => {
            chat.select(id);
            setHistory(false);
            setEditingDraft(null);
            setPicker(false);
        });
    }
    function create() {
        navigation.request(() => {
            chat.create.mutate();
            setHistory(false);
            setEditingDraft(null);
            setPicker(false);
        });
    }
    function toggleHistory() {
        setHistory((value) => !value);
    }
    function backToChat() {
        setHistory(false);
        setEditingDraft(null);
    }
    function remove() {
        if (chat.id) deleteFromHistory(chat.id);
    }
    function send() {
        if (props.workspace) {
            if (preparationLock.current) return;
            let snapshot;
            try {
                snapshot = props.workspace.getSnapshot();
                if (!snapshot.editorTarget)
                    throw new Error('The document editor is still loading.');
            } catch (error) {
                preparationFailed.current = true;
                setLocalError(error);
                return;
            }
            const editorLimit = props.workspace.editorLimit ?? 40_000;
            if (Array.from(snapshot.content).length > editorLimit) {
                setAttachmentError(
                    `Editor text exceeds the ${editorLimit.toLocaleString('en-US')}-character tutor limit. Shorten the document before sending.`,
                );
                return;
            }
            const targetId = snapshot.targetId;
            const question = chat.question;
            const copiedAttachments = [...chat.attachments];
            preparationLock.current = true;
            setPreparing(true);
            void (async () => {
                let editorTarget;
                try {
                    await props.workspace?.beforeSend?.();
                    const documentHash = await hashEditorContent(
                        snapshot.content,
                    );
                    editorTarget = {
                        ...snapshot.editorTarget,
                        documentHash,
                    };
                } catch (error) {
                    preparationFailed.current = true;
                    setLocalError(error);
                    preparationLock.current = false;
                    setPreparing(false);
                    return;
                }
                preparationFailed.current = false;
                setLocalError(null);
                try {
                    const { turn } = await chat.submit.mutateAsync({
                        content: question,
                        copiedAttachments,
                        editorContext: {
                            content: snapshot.content,
                            selectedText: snapshot.selectedPassage,
                            editorTarget,
                        },
                    });
                    if (targetId)
                        setProposalTargets((previous) =>
                            new Map(previous).set(turn.id, targetId),
                        );
                    props.workspace?.onSent?.();
                } catch {
                    // The mutation retains the composer and displays its error.
                } finally {
                    preparationLock.current = false;
                    setPreparing(false);
                }
            })();
            return;
        }
        chat.submit.mutate({
            content: chat.question,
            draftContext: chat.useDraft ? props.currentDraft : undefined,
        });
    }
    async function acceptProposal(
        text: string,
        action: 'insert' | 'append' | 'replace',
        turnId: string | null,
        anchor?: ConversationEditorTarget,
    ) {
        let targetId = turnId ? proposalTargets.get(turnId) : undefined;
        if (!targetId && action !== 'append' && anchor)
            targetId =
                (await props.workspace?.restoreTarget?.(anchor)) ?? undefined;
        if (!targetId && action !== 'append') {
            props.workspace?.onConflictProposal?.(
                text,
                action,
                undefined,
                anchor,
            );
            return 'missing';
        }
        const result = props.workspace?.onAcceptProposal(
            text,
            action,
            targetId,
        );
        if (result === 'changed' || result === 'missing')
            props.workspace?.onConflictProposal?.(
                text,
                action,
                targetId,
                anchor,
            );
        return result;
    }
    function propose(message?: ConversationUIMessage) {
        const explanation = message?.parts
            .filter((part) => part.type === 'text')
            .map((part) => part.text)
            .join('');
        const content = knowledgeProposalQuestion(
            copy.proposeQuestion,
            explanation,
            locale,
        );
        chat.submit.mutate({ content });
    }
    function retry(turn: ConversationTurn) {
        const message = detail?.messages.find(
            (item) => item.turnId === turn.id && item.role === 'user',
        );
        if (message)
            chat.submit.mutate({ content: message.content, retryOf: turn.id });
    }
    function context() {
        setPicker((value) => !value);
    }
    function closePicker() {
        setPicker(false);
    }
    function removeAttachment(id: string) {
        const remaining = attachmentSnapshot.current.filter(
            (item) => item.id !== id,
        );
        attachmentSnapshot.current = remaining;
        chat.setAttachments(remaining);
        setAttachmentError(null);
    }
    async function defaults() {
        if (!preferences) return;
        setDefaultsSaved(false);
        try {
            await requestWithSession((token) =>
                conversationApi.saveDefaults(token, preferences),
            );
            setDefaultsSaved(true);
        } catch (error) {
            setLocalError(error);
        }
    }
    function reload() {
        setLocalError(null);
        void chat.stream.reconnect();
        void chat.refresh();
    }
    function retrySubmission() {
        if (preparationFailed.current) {
            send();
            return;
        }
        if (chat.submit.variables) chat.submit.mutate(chat.submit.variables);
        else if (!chat.id) create();
        else reload();
    }
    const error = localError || chat.submit.error || chat.create.error;
    return {
        chat,
        detail,
        busy,
        active,
        unread,
        preferences,
        unavailable,
        error,
        history,
        picker,
        deleting,
        deletingPending,
        editingDraft,
        setEditingDraft,
        defaultsSaved,
        attachmentError,
        requestWithSession,
        navigation,
        draftDirty,
        discardRevision,
        select,
        create,
        toggleHistory,
        backToChat,
        remove,
        deleteFromHistory,
        cancelDelete,
        confirmDelete,
        send,
        acceptProposal,
        proposalTargets,
        propose,
        retry,
        context,
        closePicker,
        attach,
        removeAttachment,
        defaults,
        reload,
        retrySubmission,
    };
}
