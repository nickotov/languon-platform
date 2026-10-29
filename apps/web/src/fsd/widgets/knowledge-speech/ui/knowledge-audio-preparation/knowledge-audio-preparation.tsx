'use client';

import { useEffect, useRef, useState } from 'react';
import { Play, Square, Sparkles } from 'lucide-react';
import {
    SpeechConfirmation,
    useSpeechPlayer,
} from '@/fsd/features/speech-playback';
import { Button, InlineAlert } from '@/fsd/shared/ui';
import { useI18n } from '@/fsd/shared/i18n';
import {
    useKnowledgeAudioPreparation,
    type KnowledgeAudioPreparationProps,
} from '../../hooks/use-knowledge-audio-preparation';
import { audioPreparationCopy } from '../../lib/audio-preparation-copy';
import styles from './knowledge-audio-preparation.module.css';

export function KnowledgeAudioPreparation(
    props: KnowledgeAudioPreparationProps,
) {
    const { locale } = useI18n();
    const copy = audioPreparationCopy[locale];
    const state = useKnowledgeAudioPreparation(props);
    const player = useSpeechPlayer(props.requestWithSession);
    const audio = useRef<HTMLAudioElement>(null);
    const [playing, setPlaying] = useState(false);
    const [playbackFailed, setPlaybackFailed] = useState(false);
    const preview = state.prepared;
    useEffect(() => {
        const element = audio.current;
        return () => {
            element?.pause();
            element?.removeAttribute('src');
            element?.load();
        };
    }, [preview?.url]);
    function generate() {
        void state.generate();
    }
    function accept() {
        void state.accept();
    }
    function confirm() {
        void state.confirm();
    }
    async function togglePlayback() {
        const element = audio.current;
        if (!element) return;
        if (!element.paused) {
            element.pause();
            return;
        }
        setPlaybackFailed(false);
        try {
            player.registerExternalMedia(
                () => element.pause(),
                `audio-preview:${props.noteId}:${props.block.id}`,
            );
            await element.play();
        } catch {
            setPlaybackFailed(true);
            setPlaying(false);
        }
    }
    function play() {
        void togglePlayback();
    }
    function markPlaying() {
        setPlaying(true);
    }
    function markStopped() {
        setPlaying(false);
    }
    function markFailed() {
        setPlaying(false);
        setPlaybackFailed(true);
    }
    const quote = !state.staleQuote ? state.response?.quote : null;
    const unavailable =
        Boolean(state.response) &&
        ['unavailable', 'failed', 'submission_unknown'].includes(
            state.response?.state ?? '',
        );
    const canGenerate = state.sourceText.trim().length > 0 && !state.busy;
    const canAccept = Boolean(preview) && !state.stale && !state.busy;
    const generateLabel =
        state.busy && !state.importing ? copy.generating : copy.generate;
    const acceptLabel = state.importing ? copy.accepting : copy.accept;
    const playLabel = playing ? copy.stop : copy.play;
    const playIcon = playing ? (
        <Square size={14} aria-hidden />
    ) : (
        <Play size={14} aria-hidden />
    );
    const speechIcon = <Sparkles size={14} aria-hidden />;
    return (
        <section className={styles.root}>
            <Button
                type='button'
                size='compact'
                variant='ghost'
                leadingIcon={speechIcon}
                onClick={generate}
                disabled={!canGenerate}
                loading={state.busy && !state.importing}
            >
                {generateLabel}
            </Button>
            {!state.sourceText.trim() && (
                <p className={styles.note}>{copy.source}</p>
            )}
            {preview && (
                <div className={styles.preview}>
                    <strong className={styles.title}>{copy.preview}</strong>
                    <p className={styles.note}>{copy.note}</p>
                    <audio
                        ref={audio}
                        src={preview.url}
                        onPlay={markPlaying}
                        onPause={markStopped}
                        onEnded={markStopped}
                        onError={markFailed}
                        preload='metadata'
                        hidden
                    />
                    <div className={styles.actions}>
                        <Button
                            type='button'
                            size='compact'
                            variant='ghost'
                            leadingIcon={playIcon}
                            onClick={play}
                        >
                            {playLabel}
                        </Button>
                        <span className={styles.spacer} />
                        <Button
                            type='button'
                            size='compact'
                            variant='ghost'
                            onClick={state.dismiss}
                            disabled={state.busy}
                        >
                            {copy.dismiss}
                        </Button>
                        <Button
                            type='button'
                            size='compact'
                            onClick={accept}
                            disabled={!canAccept}
                            loading={state.importing}
                        >
                            {acceptLabel}
                        </Button>
                    </div>
                    {preview.response.fixture && (
                        <p className={styles.note}>{copy.fixture}</p>
                    )}
                </div>
            )}
            {(state.stale || state.staleQuote) && (
                <InlineAlert tone='warning'>{copy.stale}</InlineAlert>
            )}
            {playbackFailed && (
                <InlineAlert tone='warning'>{copy.playFailed}</InlineAlert>
            )}
            {state.staleQuote && (
                <Button
                    type='button'
                    size='compact'
                    variant='ghost'
                    onClick={state.cancelQuote}
                >
                    {copy.dismiss}
                </Button>
            )}
            {state.failed && (
                <InlineAlert tone='danger'>{copy.failed}</InlineAlert>
            )}
            {unavailable && (
                <InlineAlert tone='warning'>{copy.unavailable}</InlineAlert>
            )}
            {state.accepted && (
                <p className={styles.note} role='status'>
                    {copy.accepted}
                </p>
            )}
            {quote && (
                <SpeechConfirmation
                    quote={quote}
                    onConfirm={confirm}
                    onCancel={state.cancelQuote}
                />
            )}
        </section>
    );
}
