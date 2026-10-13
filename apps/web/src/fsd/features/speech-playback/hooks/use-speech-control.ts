'use client';
import { useEffect, useId, useRef, useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { SpeechSource } from '@languon/contracts';
import { useSessionStore } from '@/fsd/entities/session';
import type { RequestWithSession } from '@/fsd/entities/dictionary';
import { useI18n } from '@/fsd/shared/i18n';
import { showToast } from '@/fsd/shared/ui';
import { speechCopy } from '../lib/copy';
import { speechApi } from '../api/speech-api';
import { speechAvailability } from '../api/speech-availability';
import { speechPlayer, speechSourceKey } from '../model/speech-player';

export function useSpeechControl(
    source: SpeechSource,
    requestWithSession: RequestWithSession,
) {
    const { locale, t } = useI18n();
    const lastNotice = useRef<string | null>(null);
    const userId = useSessionStore((value) => value.user?.id);
    const key = speechSourceKey(source);
    const instanceId = useId();
    const selection = `${key}:${instanceId}`;
    const state = useSyncExternalStore(
        speechPlayer.subscribe,
        speechPlayer.snapshot,
        speechPlayer.serverSnapshot,
    );
    const availability = useQuery({
        queryKey: ['speech-availability', userId, key],
        queryFn: () => speechAvailability(source, requestWithSession),
        staleTime: 30_000,
        gcTime: 0,
        retry: false,
        enabled: Boolean(userId),
    });
    useEffect(() => () => speechPlayer.resetSelection(selection), [selection]);
    useEffect(
        () =>
            useSessionStore.subscribe((next, previous) => {
                if (
                    next.status !== 'authenticated' ||
                    next.user?.id !== previous.user?.id
                )
                    speechPlayer.reset();
            }),
        [],
    );
    useEffect(() => {
        if (state.selection !== selection || !state.requestId) return;
        if (
            state.billingState !== 'charged_success' &&
            state.billingState !== 'released_no_charge'
        )
            return;
        const noticeId = `${state.requestId}:${state.billingState}`;
        if (lastNotice.current === noticeId) return;
        lastNotice.current = noticeId;
        const copy = speechCopy[locale];
        const generated = state.billingState === 'charged_success';
        showToast({
            content: generated ? copy.generated : copy.notCharged,
            tone: generated ? 'success' : 'info',
            dismissLabel: t('dictionary.dialog.close'),
        });
    }, [
        state.selection,
        state.requestId,
        state.billingState,
        selection,
        locale,
        t,
    ]);
    return {
        available: availability.data === true,
        selected: state.selection === selection,
        state,
        play: () => {
            void speechPlayer.play(
                source,
                speechApi(requestWithSession),
                selection,
            );
        },
        stop: speechPlayer.reset,
        confirm: () => {
            void speechPlayer.confirm();
        },
    };
}
