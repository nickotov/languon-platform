import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { validActionBudget } from '../lib/action-budget';
import type { TextAiPreferenceResponse } from '@languon/contracts';
import { useSessionStore } from '@/fsd/entities/session';
import {
    preferencesApi,
    PreferenceApiError,
    type SessionRequest,
} from '../api/preferences-api';

export function useModelPreference(requestWithSession: SessionRequest) {
    const actor = useSessionStore((state) => state.user?.id ?? null);
    const authenticated = useSessionStore(
        (state) => state.status === 'authenticated',
    );
    const queryClient = useQueryClient();
    const actorRef = useRef(actor);
    actorRef.current = actor;
    const [base, setBase] = useState<TextAiPreferenceResponse | null>(null);
    const [budgetDraft, setBudgetDraft] = useState('');
    const [saveState, setSaveState] = useState<
        'idle' | 'saving' | 'saved' | 'error' | 'rejected' | 'conflict'
    >('idle');
    const [latest, setLatest] = useState<TextAiPreferenceResponse | null>(null);
    const [online, setOnline] = useState(true);
    const savingRef = useRef(false);
    const pref = useQuery({
        queryKey: ['text-ai-preference', actor],
        queryFn: () => requestWithSession(preferencesApi.read),
        enabled: authenticated && actor !== null,
        retry: false,
        gcTime: 0,
        refetchOnWindowFocus: false,
    });
    useEffect(() => {
        setBase(null);
        setBudgetDraft('');
        setLatest(null);
        setSaveState('idle');
        savingRef.current = false;
        return () => {
            void queryClient.cancelQueries({
                queryKey: ['text-ai-preference', actor],
            });
            queryClient.removeQueries({
                queryKey: ['text-ai-preference', actor],
            });
            queryClient.removeQueries({ queryKey: ['text-ai-catalog', actor] });
        };
    }, [actor, authenticated, queryClient]);
    useEffect(() => {
        if (pref.data && !base && authenticated) {
            setBase(pref.data);
            setBudgetDraft(pref.data.maxCreditsPerAction ?? '');
        }
    }, [pref.data, base, authenticated]);
    useEffect(() => {
        const update = () => setOnline(navigator.onLine);
        update();
        window.addEventListener('online', update);
        window.addEventListener('offline', update);
        return () => {
            window.removeEventListener('online', update);
            window.removeEventListener('offline', update);
        };
    }, []);
    const budgetValid =
        validActionBudget(budgetDraft) ||
        (budgetDraft === '' && base?.maxCreditsPerAction == null);
    const dirty =
        authenticated &&
        base !== null &&
        budgetDraft !== (base.maxCreditsPerAction ?? '');
    const saveAllowed =
        dirty &&
        budgetValid &&
        online &&
        saveState !== 'saving' &&
        saveState !== 'conflict';
    function cancel() {
        if (!base || savingRef.current) return;
        setBudgetDraft(base.maxCreditsPerAction ?? '');
        setLatest(null);
        setSaveState('idle');
    }
    async function reloadLatest() {
        setLatest(null);
        const owner = actor;
        try {
            const result = await pref.refetch();
            if (
                actorRef.current === owner &&
                useSessionStore.getState().user?.id === owner &&
                result.isSuccess &&
                result.data
            )
                setLatest(result.data);
        } catch {
            /* The query exposes its failure for retry. */
        }
    }
    async function save(overwrite = false) {
        const expected = overwrite ? latest : base;
        if (
            !authenticated ||
            !expected ||
            !online ||
            !budgetValid ||
            savingRef.current
        )
            return;
        if (!overwrite && saveState === 'conflict') return;
        const owner = actor;
        savingRef.current = true;
        setSaveState('saving');
        try {
            const body = {
                mode: 'auto' as const,
                expectedVersion: expected.version,
                ...(budgetDraft ? { maxCreditsPerAction: budgetDraft } : {}),
            };
            const saved = await requestWithSession((token) =>
                preferencesApi.save(token, body),
            );
            if (
                actorRef.current !== owner ||
                useSessionStore.getState().user?.id !== owner ||
                useSessionStore.getState().status !== 'authenticated'
            )
                return;
            setBase(saved);
            setBudgetDraft(saved.maxCreditsPerAction ?? '');
            setLatest(null);
            setSaveState('saved');
            queryClient.setQueryData(['text-ai-preference', actor], saved);
        } catch (error) {
            if (
                actorRef.current !== owner ||
                useSessionStore.getState().user?.id !== owner ||
                useSessionStore.getState().status !== 'authenticated'
            )
                return;
            if (
                error instanceof PreferenceApiError &&
                error.code === 'conflict'
            ) {
                setSaveState('conflict');
                await reloadLatest();
            } else setSaveState('error');
        } finally {
            if (actorRef.current === owner) savingRef.current = false;
        }
    }
    function useLatest() {
        if (!latest) return;
        setBase(latest);
        setBudgetDraft(latest.maxCreditsPerAction ?? '');
        setLatest(null);
        setSaveState('idle');
    }
    return {
        base: authenticated ? base : null,
        pref,
        dirty,
        saveState,
        online,
        latest: authenticated ? latest : null,
        saveAllowed,
        budgetDraft,
        budgetValid,
        selectBudget(value: string) {
            if (savingRef.current) return;
            setBudgetDraft(value);
            if (saveState !== 'conflict') setSaveState('idle');
        },
        cancel,
        save,
        reloadLatest,
        useLatest,
    };
}
export type ModelPreferenceController = ReturnType<typeof useModelPreference>;
