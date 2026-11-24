import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type SetStateAction,
} from 'react';
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
import { useBlockReferences } from './use-block-references';
import { useWorkspacePassage } from './use-workspace-passage';
import { useWorkspaceAutoSend } from './use-workspace-auto-send';
import {
    replacePreparedInstruction,
    stripPromptSelections,
} from '../lib/prompt-selection';
import type { PromptValue } from '../lib/prompt-document';
import { useExerciseComposer } from './use-exercise-composer';
import { workspaceCopy } from '../lib/workspace-copy';
import { hashEditorContent } from '../lib/hash-editor-content';
import type { ContextualAssistantProps } from '../types';
import {
    appendAssistantAttachment,
    knowledgeProposalQuestion,
} from '../lib/assistant-input';

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
            if (result.error && props.workspace) {
                showToast({
                    content: result.error,
                    dismissLabel: 'Dismiss',
                    tone: 'warning',
                });
            }

            return !result.error;
        },
        [chat.setAttachments, locale, props.workspace],
    );
    const initialized = useRef(false);
    const lastPassage = useRef<string | null>(null);
    const lastRequest = useRef<string | null>(null);
    const workspaceRequest = props.workspace?.request;
    const blockReferences = useBlockReferences(
        chat.id,
        props.request ?? workspaceRequest,
        props.blocks,
    );
    const composerRequest = props.request ?? workspaceRequest;
    function prepareQuestion(value: SetStateAction<string>) {
        chat.setPromptMentions([]);
        chat.setQuestion(value);
    }

    function preparePrompt(previous: string | null, next: string) {
        const value = replacePreparedInstruction(
            stripPromptSelections({
                content: chat.question,
                promptMentions: chat.promptMentions ?? [],
            }),
            previous,
            next,
        );

        chat.setQuestion(value.content);
        chat.setPromptMentions(value.promptMentions);
    }

    const exercises = useExerciseComposer({
        conversationId: chat.id,
        externalRequest: composerRequest,
        setQuestion: prepareQuestion,
        replaceReferences: blockReferences.replace,
        preparePrompt,
    });

    useEffect(() => {
        if (!composerRequest || composerRequest.id === lastRequest.current) {
            return;
        }

        lastRequest.current = composerRequest.id;
        if (composerRequest.prompt !== undefined) {
            chat.replaceQuestion(composerRequest.prompt);
        }

        setAttachmentError((current) =>
            current === workspaceCopy(locale).selectionChanged ? null : current,
        );

        setHistory(false);
        setEditingDraft(null);
        setPicker(false);
    }, [composerRequest, chat.setQuestion, locale]);

    const lastGenericPassage = useRef<string | null>(null);
    useEffect(() => {
        const request = props.request;
        if (!request || lastGenericPassage.current === request.id) {
            return;
        }

        lastGenericPassage.current = request.id;
        if (request.passage) {
            attach({
                id: request.id,
                label: copy.selection,
                content: request.passage,
            });
        }
    }, [props.request, copy.selection, attach]);

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
        if (!props.folded) {
            setUnread(false);
        } else if (wasActive.current && !active) {
            setUnread(true);
        }

        wasActive.current = active;
    }, [active, props.folded]);

    useEffect(() => {
        setAttachmentError(null);
    }, [chat.id]);

    useEffect(() => {
        const passage = props.selectedPassage;
        if (props.workspace) {
            return;
        }

        if (!passage || passage.id === lastPassage.current) {
            return;
        }

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
        if (!manualPreferences) {
            return;
        }

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
        if (chat.id) {
            deleteFromHistory(chat.id);
        }
    }

    function changePrompt(value: PromptValue) {
        const mentionedActivities = [
            ...new Set(
                value.promptMentions.flatMap((item) =>
                    item.kind === 'exercise' ? [item.activityId] : [],
                ),
            ),
        ];
        const explicitActivities = exercises.request?.activities?.map(
            (item) => item.activityId,
        );
        const mismatch =
            exercises.request?.mode === 'automatic'
                ? mentionedActivities.length > 0
                : explicitActivities &&
                  JSON.stringify(mentionedActivities) !==
                      JSON.stringify(explicitActivities);

        if (!value.synchronize && mismatch) {
            exercises.clear();
        }

        chat.setQuestion(value.content);
        chat.setPromptMentions(value.promptMentions);
        blockReferences.replace([
            ...new Set(
                value.promptMentions.flatMap((mention) =>
                    mention.kind === 'block' ? [mention.blockId] : [],
                ),
            ),
        ]);
    }

    const missingPromptSource = (chat.promptMentions ?? []).some(
        (mention) =>
            mention.kind === 'block' &&
            !props.blocks?.some((block) => block.id === mention.blockId),
    );
    const missingBlockReference =
        blockReferences.missing || missingPromptSource;

    function send(readingChoice?: string) {
        if (!readingChoice && missingBlockReference) {
            return;
        }

        if (props.workspace) {
            if (preparationLock.current) {
                return;
            }

            const selectedPassage = readingChoice
                ? null
                : workspaceSelection.passage;
            let snapshot;
            try {
                snapshot = props.workspace.getSnapshot(
                    selectedPassage?.targetId ?? null,
                );

                if (!snapshot.editorTarget) {
                    throw new Error('The document editor is still loading.');
                }
            } catch (error) {
                preparationFailed.current = true;
                if (selectedPassage) {
                    setAttachmentError(workspaceCopy(locale).selectionChanged);
                } else {
                    setLocalError(error);
                }

                return;
            }

            const editorLimit = props.workspace.editorLimit ?? 40_000;
            if (
                selectedPassage &&
                selectedPassage.content !== snapshot.editorTarget.originalText
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
            const question = readingChoice ?? chat.question;
            const exerciseRequest = readingChoice
                ? undefined
                : exercises.request;
            const copiedAttachments = readingChoice
                ? []
                : [...chat.attachments];
            const referencedIds = readingChoice
                ? []
                : blockReferences.selected.map((item) => item.id);

            if (!readingChoice && blockReferences.missing) {
                return;
            }

            setAttachmentError(null);
            preparationLock.current = true;
            setPreparing(true);
            void (async () => {
                let editorTarget;
                let workingBranch;
                try {
                    workingBranch = await props.workspace?.beforeSend?.();
                    if (
                        workingBranch &&
                        props.workspace?.getSnapshot(targetId ?? null)
                            .content !== snapshot.content
                    ) {
                        throw new Error(
                            'The document changed while preparing this request. Send it again using the current document.',
                        );
                    }

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
                const firstMessage = !chat.detail.data?.conversation.title;

                try {
                    await chat.submit.mutateAsync({
                        content: question,
                        promptMentions: readingChoice
                            ? []
                            : chat.promptMentions,
                        copiedAttachments,
                        blockReferences: referencedIds,
                        exerciseRequest,
                        editorContext: {
                            ...(workingBranch ? { workingBranch } : {}),
                            content: snapshot.content,
                            selectedText: selectedPassage?.content,
                            editorTarget,
                        },
                        onAccepted(turn) {
                            if (targetId) {
                                setProposalTargets((previous) =>
                                    new Map(previous).set(turn.id, targetId),
                                );
                            }

                            props.workspace?.onSent?.(firstMessage);
                            if (readingChoice) {
                                return;
                            }

                            workspaceSelection.sent(selectedPassage?.id);
                            blockReferences.sent(referencedIds);
                            exercises.accepted(exerciseRequest);
                        },
                    });
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
            promptMentions: chat.promptMentions,
            exerciseRequest: exercises.request,
            blockReferences: blockReferences.selected.map((item) => item.id),
            onAccepted() {
                exercises.accepted(exercises.request);
                blockReferences.sent(
                    blockReferences.selected.map((item) => item.id),
                );
            },
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

        if (!targetId && action !== 'append' && anchor) {
            targetId =
                (await props.workspace?.restoreTarget?.(anchor)) ?? undefined;
        }

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

        if (result === 'changed' || result === 'missing') {
            props.workspace?.onConflictProposal?.(
                text,
                action,
                targetId,
                anchor,
                format,
            );
        }

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

    function continueResponse() {
        const content = {
            en: 'Continue your previous response from where it stopped.',
            ru: 'Продолжи предыдущий ответ с того места, где остановился.',
            fr: 'Continue ta réponse précédente à partir de là où elle s’est arrêtée.',
            es: 'Continúa tu respuesta anterior desde donde se detuvo.',
        }[locale];

        chat.submit.mutate({ content });
    }

    function retry(turn: ConversationTurn) {
        const message = detail?.messages.find(
            (item) => item.turnId === turn.id && item.role === 'user',
        );

        if (message) {
            chat.submit.mutate({
                content: message.content,
                promptMentions: message.promptMentions,
                retryOf: turn.id,
                blockReferences: message.blockReferences ?? [],
            });
        }
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
        if (manualPreferences && preferences) {
            chat.updatePreferences(
                mergeDisplayedPreferences(
                    manualPreferences,
                    preferences,
                    value,
                ),
            );
        }
    }

    async function saveDefaults(value: NonNullable<typeof preferences>) {
        if (defaultsLock.current) {
            return;
        }

        defaultsLock.current = true;
        const revision = ++defaultsRevision.current;
        setDefaultsPending(true);
        setDefaultsSaved(false);
        setDefaultsFailure(null);
        try {
            await requestWithSession((token) =>
                conversationApi.saveDefaults(token, value),
            );

            if (defaultsRevision.current === revision) {
                setDefaultsSaved(true);
            }
        } catch (error) {
            if (defaultsRevision.current === revision) {
                setDefaultsFailure({ error, preferences: value });
            }
        } finally {
            defaultsLock.current = false;
            setDefaultsPending(false);
        }
    }

    async function defaults() {
        if (manualPreferences) {
            await saveDefaults(manualPreferences);
        }
    }

    function retryDefaults() {
        if (defaultsFailure) {
            void saveDefaults(defaultsFailure.preferences);
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

        if (chat.submit.variables) {
            chat.submit.mutate(chat.submit.variables);
        } else if (!chat.id) {
            create();
        } else {
            reload();
        }
    }

    const error = localError || chat.submit.error || chat.create.error;

    return {
        chat,
        changePrompt,
        composerRequest,
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
        blockReferences,
        missingBlockReference,
        exercises,
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
        continueResponse,
        context,
        closePicker,
        attach,
        removeAttachment,
        defaults,
        reload,
        retrySubmission,
    };
}
