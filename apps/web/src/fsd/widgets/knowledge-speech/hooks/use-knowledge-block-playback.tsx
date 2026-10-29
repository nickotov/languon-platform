'use client';

import { useEffect, useRef, useState } from 'react';
import type { LearningBlock, SpeechSource } from '@languon/contracts';
import type { RequestWithSession } from '@/fsd/entities/dictionary';
import type {
    LearningBlockPlayback,
    LearningPlaybackRequest,
} from '@/fsd/entities/learning-blocks';
import {
    SpeechConfirmation,
    useSpeechPlayer,
} from '@/fsd/features/speech-playback';
import { knowledgeSnippetSelector } from '../lib/snippet-selector';

export type KnowledgeSnippetOrigin = Extract<
    SpeechSource,
    { kind: 'knowledge-snippet' }
>['origin'];
export type KnowledgePlaybackSnapshot = {
    origin: KnowledgeSnippetOrigin;
    blocks: LearningBlock[];
};

/** Binds visible block playback to an authorized, immutable source snapshot. */
export function useKnowledgeBlockPlayback({
    noteId,
    requestWithSession,
}: {
    noteId: string;
    requestWithSession: RequestWithSession;
}) {
    const player = useSpeechPlayer(requestWithSession);
    const [preparingId, setPreparingId] = useState<string>();
    const [failedId, setFailedId] = useState<string>();
    const revision = useRef(0);
    useEffect(
        () => () => {
            revision.current += 1;
        },
        [noteId],
    );

    function options(
        snapshot: () => Promise<KnowledgePlaybackSnapshot>,
    ): LearningBlockPlayback {
        async function play(request: LearningPlaybackRequest) {
            const operation = ++revision.current;
            player.stop();
            setFailedId(undefined);
            setPreparingId(request.id);
            try {
                const current = await snapshot();
                if (revision.current !== operation) return;
                const block = current.blocks.find(
                    (item) => item.id === request.blockId,
                );
                const selector =
                    block &&
                    knowledgeSnippetSelector(
                        block,
                        request.text,
                        request.language,
                    );
                if (!selector) throw new Error('The playback source changed.');
                await player.play(
                    {
                        kind: 'knowledge-snippet',
                        noteId,
                        blockId: request.blockId,
                        origin: current.origin,
                        selector,
                    },
                    request.id,
                );
            } catch {
                if (revision.current === operation) setFailedId(request.id);
            } finally {
                if (revision.current === operation) setPreparingId(undefined);
            }
        }
        function stop() {
            revision.current += 1;
            setPreparingId(undefined);
            setFailedId(undefined);
            player.stop();
        }
        let status: LearningBlockPlayback['status'];
        if (
            preparingId ||
            (player.selected &&
                ['loading', 'confirmation'].includes(player.state.phase))
        )
            status = 'preparing';
        else if (player.selected && player.state.phase === 'playing')
            status = 'playing';
        else if (
            failedId ||
            (player.selected &&
                ['failed', 'unavailable'].includes(player.state.phase))
        )
            status = 'unavailable';
        return {
            activeId: preparingId ?? failedId ?? player.targetId,
            status,
            onPlay: (request) => {
                void play(request);
            },
            onStop: stop,
            onMediaStart: ({ id, pause }) => {
                revision.current += 1;
                setPreparingId(undefined);
                setFailedId(undefined);
                player.registerExternalMedia(pause, id);
            },
        };
    }
    const quote = player.selected ? player.state.quote : null;
    const confirmation = quote ? (
        <SpeechConfirmation
            quote={quote}
            onConfirm={player.confirm}
            onCancel={player.stop}
        />
    ) : null;
    return { options, confirmation };
}
