'use client';

import { useEffect, useId, useSyncExternalStore } from 'react';
import type { SpeechSource } from '@languon/contracts';
import type { RequestWithSession } from '@/fsd/entities/dictionary';
import { useSessionStore } from '@/fsd/entities/session';
import { speechApi } from '../api/speech-api';
import { speechPlayer } from '../model/speech-player';

/** One coordinator for block snippets and the existing dictionary playback. */
export function useSpeechPlayer(requestWithSession: RequestWithSession) {
    const instance = useId();
    const prefix = `block-speech:${instance}:`;
    const state = useSyncExternalStore(
        speechPlayer.subscribe,
        speechPlayer.snapshot,
        speechPlayer.serverSnapshot,
    );
    useEffect(
        () => () => {
            const selection = speechPlayer.snapshot().selection;
            if (selection?.startsWith(prefix)) speechPlayer.reset();
        },
        [prefix],
    );
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
    function play(source: SpeechSource, targetId: string) {
        return speechPlayer.play(
            source,
            speechApi(requestWithSession),
            `${prefix}${targetId}`,
        );
    }
    function confirm() {
        void speechPlayer.confirm();
    }
    const selected = state.selection?.startsWith(prefix) ?? false;
    return {
        state,
        selected,
        targetId: selected ? state.selection?.slice(prefix.length) : undefined,
        play,
        confirm,
        stop: speechPlayer.reset,
        registerExternalMedia: speechPlayer.registerExternalMedia,
    };
}
