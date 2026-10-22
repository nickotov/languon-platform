import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
    ChatPreferences,
    ConversationSource,
    CopiedAttachment,
    SubmitConversationTurnRequest,
} from '@languon/contracts';
import {
    conversationApi,
    type ConversationSessionRequest,
} from '@/fsd/entities/conversation';
import { useConversationAdmission } from './use-conversation-admission';
import { useConversationStream } from './use-conversation-stream';

type ActionFailure =
    | {
          kind: 'preferences';
          conversationId: string;
          preferences: ChatPreferences;
          error: unknown;
      }
    | { kind: 'stop'; conversationId: string; turnId: string; error: unknown };

export function useConversation(
    actorId: string,
    source: ConversationSource,
    request: ConversationSessionRequest,
    shareKey?: string,
) {
    const client = useQueryClient();
    const [selected, setSelected] = useState<string | null>(null);
    const [question, setQuestion] = useState('');
    const [attachments, setAttachments] = useState<CopiedAttachment[]>([]);
    const [useDraft, setUseDraft] = useState(false);
    const [lastActionFailure, setLastActionFailure] =
        useState<ActionFailure | null>(null);
    const [preferencesPending, setPreferencesPending] = useState(false);
    const preferencesLock = useRef(false);
    const composerDrafts = useRef(
        new Map<
            string,
            {
                question: string;
                attachments: CopiedAttachment[];
                useDraft: boolean;
            }
        >(),
    );
    const pendingRequest = useRef<SubmitConversationTurnRequest | null>(null);
    const sourceIdentity = JSON.stringify(source);
    const listKey = ['conversations', actorId, sourceIdentity];
    const list = useQuery({
        queryKey: listKey,
        queryFn: ({ signal }) =>
            request((token) =>
                conversationApi.list(token, source, shareKey, signal),
            ),
        retry: false,
        gcTime: 0,
    });
    const id = selected ?? list.data?.conversations[0]?.id ?? null;
    const currentConversationId = useRef(id);
    currentConversationId.current = id;
    useEffect(() => setLastActionFailure(null), [id]);
    const actionFailure =
        lastActionFailure?.conversationId === id ? lastActionFailure : null;
    const actionError = Boolean(actionFailure);
    const detail = useQuery({
        queryKey: ['conversation', actorId, id],
        queryFn: ({ signal }) =>
            request((token) =>
                conversationApi.detail(token, id!, shareKey, signal),
            ),
        enabled: Boolean(id),
        retry: false,
        gcTime: 0,
    });
    const stream = useConversationStream(
        actorId,
        id,
        request,
        shareKey,
        detail.data,
    );
    useEffect(() => {
        setSelected(null);
        setQuestion('');
        setAttachments([]);
        setUseDraft(false);
        pendingRequest.current = null;
    }, [sourceIdentity, actorId]);
    const active = detail.data?.turns.find(
        (turn) => turn.status === 'queued' || turn.status === 'running',
    );
    async function refresh(conversationId = id) {
        await Promise.all([
            client.invalidateQueries({ queryKey: listKey }),
            client.invalidateQueries({
                queryKey: ['conversation', actorId, conversationId],
            }),
        ]);
    }
    function rememberComposer() {
        if (id)
            composerDrafts.current.set(id, { question, attachments, useDraft });
    }
    function restoreComposer(next: string) {
        const saved = composerDrafts.current.get(next);
        setQuestion(saved?.question ?? '');
        setAttachments(saved?.attachments ?? []);
        setUseDraft(saved?.useDraft ?? false);
        pendingRequest.current = null;
    }
    const create = useMutation({
        mutationFn: (preferences?: ChatPreferences) =>
            request((token) =>
                conversationApi.create(token, source, shareKey, preferences),
            ),
        onSuccess: async ({ conversation }) => {
            // The first conversation adopts a passage attached while creation runs.
            if (id) {
                rememberComposer();
                restoreComposer(conversation.id);
            }
            setSelected(conversation.id);
            await refresh(conversation.id);
        },
    });
    const admission = useConversationAdmission({
        id,
        attachments,
        pendingRequest,
        submitTurn: stream.submit,
        setQuestion,
        setAttachments,
        refresh,
    });
    function clearActionFailure(
        kind: ActionFailure['kind'],
        conversationId: string,
    ) {
        setLastActionFailure((current) =>
            current?.kind === kind && current.conversationId === conversationId
                ? null
                : current,
        );
    }
    async function stopTurn(conversationId: string, turnId: string) {
        clearActionFailure('stop', conversationId);
        try {
            await request((token) =>
                conversationApi.stop(token, conversationId, turnId, shareKey),
            );
            await refresh(conversationId);
        } catch (error) {
            setLastActionFailure({
                kind: 'stop',
                conversationId,
                turnId,
                error,
            });
        }
    }
    async function stop() {
        if (active && id) await stopTurn(id, active.id);
    }
    async function savePreferences(
        conversationId: string,
        preferences: ChatPreferences,
    ) {
        if (preferencesLock.current) return;
        preferencesLock.current = true;
        setPreferencesPending(true);
        clearActionFailure('preferences', conversationId);
        try {
            await request((token) =>
                conversationApi.update(
                    token,
                    conversationId,
                    preferences,
                    shareKey,
                ),
            );
            await refresh(conversationId);
        } catch (error) {
            if (currentConversationId.current === conversationId)
                setLastActionFailure({
                    kind: 'preferences',
                    conversationId,
                    preferences,
                    error,
                });
        } finally {
            preferencesLock.current = false;
            setPreferencesPending(false);
        }
    }
    async function updatePreferences(preferences: ChatPreferences) {
        if (id) await savePreferences(id, preferences);
    }
    function retryAction() {
        if (actionFailure?.kind === 'preferences')
            void savePreferences(
                actionFailure.conversationId,
                actionFailure.preferences,
            );
        else if (actionFailure?.kind === 'stop')
            void stopTurn(actionFailure.conversationId, actionFailure.turnId);
    }
    async function rename(conversationId: string, title: string) {
        await request((token) =>
            conversationApi.rename(token, conversationId, title, shareKey),
        );
        await refresh(conversationId);
    }
    async function remove(conversationId = id) {
        if (!conversationId) return;
        await request((token) =>
            conversationApi.delete(token, conversationId, shareKey),
        );
        client.removeQueries({
            queryKey: ['conversation', actorId, conversationId],
            exact: true,
        });
        composerDrafts.current.delete(conversationId);
        if (conversationId === id) {
            setSelected(null);
            setQuestion('');
            setAttachments([]);
            setUseDraft(false);
            pendingRequest.current = null;
        }
        await refresh();
    }
    function select(next: string) {
        rememberComposer();
        restoreComposer(next);
        setSelected(next);
    }
    return {
        id,
        list,
        detail,
        active,
        stream,
        create,
        ...admission,
        question,
        setQuestion,
        attachments,
        setAttachments,
        useDraft,
        setUseDraft,
        actionError,
        actionFailure,
        retryAction,
        preferencesPending,
        stop,
        updatePreferences,
        rename,
        remove,
        select,
        refresh,
    };
}
