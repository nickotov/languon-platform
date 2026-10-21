import { useCallback, useEffect, useRef, useState } from 'react';
import type {
    ChatPreferences,
    ConversationEditorTarget,
    ConversationTurn,
    CopiedAttachment,
} from '@languon/contracts';
import {
    conversationApi,
    conversationCopy,
    type ConversationUIMessage,
} from '@/fsd/entities/conversation';
import { mergeDisplayedPreferences } from '@/fsd/features/conversation-preferences';
import { useAuth } from '@/fsd/features/auth';
import { useI18n } from '@/fsd/shared/i18n';
import { showToast } from '@/fsd/shared/ui';
import { useConversation } from './use-conversation';
import { useAssistantNavigation } from './use-assistant-navigation';
import { useConversationDeletion } from './use-conversation-deletion';
import { useWorkspacePassage } from './use-workspace-passage';
import { useWorkspaceAutoSend } from './use-workspace-auto-send';
import { workspaceCopy } from '../lib/workspace-copy';
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
    const workspaceSelection = useWorkspacePassage(
        props.workspace?.request,
        chat.id,
    );
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
    const [defaultsFailure, setDefaultsFailure] = useState<{
        error: unknown;
        preferences: ChatPreferences;
    } | null>(null);
    const [defaultsPending, setDefaultsPending] = useState(false);
    const defaultsLock = useRef(false);
    const defaultsRevision = useRef(0);
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
    const lastRequest = useRef<string | null>(null);
    const workspaceRequest = props.workspace?.request;
    useEffect(() => {
        if (!workspaceRequest || workspaceRequest.id === lastRequest.current)
            return;
        lastRequest.current = workspaceRequest.id;
        if (workspaceRequest.prompt !== undefined)
            chat.setQuestion(workspaceRequest.prompt);
        setAttachmentError((current) =>
            current === workspaceCopy(locale).selectionChanged ? null : current,
        );
        setHistory(false);
    }, [workspaceRequest, chat.setQuestion, locale]);
    const [unread, setUnread] = useState(false);
    const active = Boolean(chat.active);
    const wasActive = useRef(active);
    const busy =
        chat.create.isPending ||
        chat.submit.isPending ||
        preparing ||
        Boolean(chat.preferencesPending) ||
        defaultsPending;
    const onBusyChange = props.workspace?.onBusyChange;
    useEffect(() => {
        onBusyChange?.(busy || active);
        return () => onBusyChange?.(false);
    }, [busy, active, onBusyChange]);
    const detail = chat.detail.data;
    const manualPreferences = detail?.conversation.preferences;
    const preferences =
        detail?.conversation.effectivePreferences ?? manualPreferences;
    const preferencesIdentity = JSON.stringify(preferences);
    useEffect(() => {
        defaultsRevision.current += 1;
        setDefaultsFailure(null);
        setDefaultsSaved(false);
    }, [chat.id, preferencesIdentity]);
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
            chat.create.mutate(undefined);
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
        if (props.workspace) return;
        if (!passage || passage.id === lastPassage.current) return;
        lastPassage.current = passage.id;
        attach({
            id: passage.id,
            label: copy.selection,
            content: passage.text,
        });
    }, [props.selectedPassage, props.workspace, copy.selection, attach]);

    function select(id: string) {
        navigation.request(() => {
            chat.select(id);
            workspaceSelection.remove();
            setHistory(false);
            setEditingDraft(null);
            setPicker(false);
        });
    }
    function create() {
        navigation.request(() => {
            chat.create.mutate(undefined);
            workspaceSelection.remove();
            setHistory(false);
            setEditingDraft(null);
            setPicker(false);
        });
    }
    function createWithoutPortrait() {
        if (!manualPreferences) return;
        const next = {
            ...manualPreferences,
            portrait: {
                enabled: false,
                inheritedFields:
                    manualPreferences.portrait?.inheritedFields ?? [],
            },
        };
        navigation.request(() => {
            chat.create.mutate(next);
            workspaceSelection.remove();
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
                snapshot = props.workspace.getSnapshot(
                    workspaceSelection.passage?.targetId ?? null,
                );
                if (!snapshot.editorTarget)
                    throw new Error('The document editor is still loading.');
            } catch (error) {
                preparationFailed.current = true;
                if (workspaceSelection.passage)
                    setAttachmentError(workspaceCopy(locale).selectionChanged);
                else setLocalError(error);
                return;
            }
            const editorLimit = props.workspace.editorLimit ?? 40_000;
            if (
                workspaceSelection.passage &&
                workspaceSelection.passage.content !==
                    snapshot.editorTarget.originalText
            ) {
                setAttachmentError(workspaceCopy(locale).selectionChanged);
                return;
            }
            if (Array.from(snapshot.content).length > editorLimit) {
                setAttachmentError(
                    `Editor text exceeds the ${editorLimit.toLocaleString('en-US')}-character tutor limit. Shorten the document before sending.`,
                );
                return;
            }
            const targetId = snapshot.targetId;
            const question = chat.question;
            const copiedAttachments = [...chat.attachments];
            const selectedPassage = workspaceSelection.passage;
            setAttachmentError(null);
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
                            selectedText: selectedPassage?.content,
                            editorTarget,
                        },
                    });
                    if (targetId)
                        setProposalTargets((previous) =>
                            new Map(previous).set(turn.id, targetId),
                        );
                    props.workspace?.onSent?.();
                    workspaceSelection.sent(selectedPassage?.id);
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
    useWorkspaceAutoSend({
        request: workspaceRequest,
        question: chat.question,
        passage: workspaceSelection.passage,
        ready: Boolean(chat.id && detail && !busy && !active && !unavailable),
        send,
    });
    async function acceptProposal(
        text: string,
        action: 'insert' | 'append' | 'replace',
        turnId: string | null,
        anchor?: ConversationEditorTarget,
        trackedTargetId?: string,
        format?: 'markdown' | 'plain-text',
    ) {
        let targetId =
            trackedTargetId ??
            (turnId ? proposalTargets.get(turnId) : undefined);
        if (!targetId && action !== 'append' && anchor)
            targetId =
                (await props.workspace?.restoreTarget?.(anchor)) ?? undefined;
        if (!targetId && action !== 'append') {
            props.workspace?.onConflictProposal?.(
                text,
                action,
                undefined,
                anchor,
                format,
            );
            return 'missing';
        }
        const result = props.workspace?.onAcceptProposal(
            text,
            action,
            targetId,
            format,
        );
        if (result === 'changed' || result === 'missing')
            props.workspace?.onConflictProposal?.(
                text,
                action,
                targetId,
                anchor,
                format,
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
    function removeWorkspacePassage() {
        workspaceSelection.remove();
        setAttachmentError((current) =>
            current === workspaceCopy(locale).selectionChanged ? null : current,
        );
    }
    function updatePreferences(value: NonNullable<typeof preferences>) {
        defaultsRevision.current += 1;
        setDefaultsFailure(null);
        setDefaultsSaved(false);
        if (manualPreferences && preferences)
            chat.updatePreferences(
                mergeDisplayedPreferences(
                    manualPreferences,
                    preferences,
                    value,
                ),
            );
    }
    async function saveDefaults(value: NonNullable<typeof preferences>) {
        if (defaultsLock.current) return;
        defaultsLock.current = true;
        const revision = ++defaultsRevision.current;
        setDefaultsPending(true);
        setDefaultsSaved(false);
        setDefaultsFailure(null);
        try {
            await requestWithSession((token) =>
                conversationApi.saveDefaults(token, value),
            );
            if (defaultsRevision.current === revision) setDefaultsSaved(true);
        } catch (error) {
            if (defaultsRevision.current === revision)
                setDefaultsFailure({ error, preferences: value });
        } finally {
            defaultsLock.current = false;
            setDefaultsPending(false);
        }
    }
    async function defaults() {
        if (manualPreferences) await saveDefaults(manualPreferences);
    }
    function retryDefaults() {
        if (defaultsFailure) void saveDefaults(defaultsFailure.preferences);
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
        defaultsFailure,
        retryDefaults,
        updatePreferences,
        attachmentError,
        workspacePassage: workspaceSelection.passage,
        removeWorkspacePassage,
        requestWithSession,
        navigation,
        draftDirty,
        discardRevision,
        select,
        create,
        createWithoutPortrait,
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
