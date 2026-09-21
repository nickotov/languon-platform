'use client';

import { useEffect, useRef, useState } from 'react';
import type { RequestWithSession } from '@/fsd/entities/dictionary';
import { useSessionStore } from '@/fsd/entities/session';
import { prepareAudio } from '../api/prepare-audio';
import { AudioPlayback } from '../lib/audio-playback';
import type { AudioPlaybackState } from '../types';

export function useDictionaryAudio(
    dictionaryId: string,
    requestWithSession: RequestWithSession,
    contentIdentity: string,
) {
    const [state, setState] = useState<AudioPlaybackState>({
        selection: null,
        phase: 'idle',
        fixture: false,
    });
    const [speed, setSpeed] = useState(1);
    const latest = useRef({ dictionaryId, requestWithSession });
    latest.current = { dictionaryId, requestWithSession };
    const [player] = useState(
        () =>
            new AudioPlayback(
                {
                    prepare: (selection, signal) =>
                        prepareAudio(
                            latest.current.requestWithSession,
                            latest.current.dictionaryId,
                            selection,
                            signal,
                        ),
                },
                setState,
            ),
    );
    useEffect(() => {
        player.reset();
        return () => player.dispose();
    }, [player, dictionaryId, contentIdentity]);
    useEffect(
        () =>
            useSessionStore.subscribe((next, previous) => {
                if (
                    next.status !== 'authenticated' ||
                    next.user?.id !== previous.user?.id
                )
                    player.reset();
            }),
        [player],
    );
    return {
        state,
        speed,
        play: player.play.bind(player),
        stop: () => player.stop(),
        setSpeed: (value: number) => {
            player.setSpeed(value);
            setSpeed(value);
        },
    };
}
