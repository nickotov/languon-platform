'use client';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ChatPreferences } from '@languon/contracts';
import { useSessionStore } from '@/fsd/entities/session';
import {
    conversationApi,
    conversationCopy,
    type ConversationSessionRequest,
} from '@/fsd/entities/conversation';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, Card, LoadingState } from '@/fsd/shared/ui';
import { ConversationPreferences } from './conversation-preferences';
import styles from './conversation-preferences.module.css';

export function ConversationDefaults({
    requestWithSession,
    onDirtyChange,
}: {
    requestWithSession: ConversationSessionRequest;
    onDirtyChange?(dirty: boolean): void;
}) {
    const { locale } = useI18n();
    const copy = conversationCopy(locale);
    const actor = useSessionStore((state) => state.user?.id);
    const client = useQueryClient();
    const [draft, setDraft] = useState<ChatPreferences | null>(null);
    const queryKey = ['conversation-defaults', actor];
    const query = useQuery({
        queryKey,
        queryFn: ({ signal }) =>
            requestWithSession((token) =>
                conversationApi.readDefaults(token, signal),
            ),
        retry: false,
    });
    const mutation = useMutation({
        mutationFn: (preferences: ChatPreferences) =>
            requestWithSession((token) =>
                conversationApi.saveDefaults(token, preferences),
            ),
        onSuccess: (value) => {
            client.setQueryData(queryKey, value);
            setDraft(null);
        },
    });
    const dirty = Boolean(
        draft &&
        JSON.stringify(draft) !== JSON.stringify(query.data?.preferences),
    );
    useEffect(() => {
        onDirtyChange?.(dirty);
        return () => onDirtyChange?.(false);
    }, [dirty, onDirtyChange]);
    const value = draft ?? query.data?.preferences;
    function save() {
        if (value) mutation.mutate(value);
    }
    function retry() {
        void query.refetch();
    }
    return (
        <Card variant='outlined' className={styles.section}>
            <h2>{copy.defaultsTitle}</h2>
            <p>{copy.defaultsHint}</p>
            {query.isPending && <LoadingState>{copy.loading}</LoadingState>}
            {query.isError && (
                <>
                    <p role='alert' className={styles.error}>
                        {copy.preferencesError}
                    </p>
                    <Button onClick={retry}>{copy.retry}</Button>
                </>
            )}
            {value && (
                <>
                    <ConversationPreferences
                        value={value}
                        onChange={setDraft}
                        disabled={mutation.isPending}
                    />
                    <Button
                        onClick={save}
                        disabled={!dirty}
                        loading={mutation.isPending}
                    >
                        {copy.saveDefaults}
                    </Button>
                </>
            )}
            {mutation.isError && (
                <p role='alert' className={styles.error}>
                    {copy.preferencesError}
                </p>
            )}
            {mutation.isSuccess && !dirty && <p role='status'>{copy.saved}</p>}
        </Card>
    );
}
