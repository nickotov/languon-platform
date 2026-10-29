import { useRef, useState } from 'react';
import type { LearningBlock } from '@languon/contracts';
import { Button } from '@/fsd/shared/ui/button/button';
import { safeAudioUrl } from '../../lib/safe-audio-url';
import type { LearningBlockViewProps } from '../../types';
import { AudioPlayer } from './audio-player';
import { Transcript } from './transcript';
import { VideoPlayer, type VideoSeek } from './video-player';
import mediaStyles from './media-block.module.css';
export { Transcript } from './transcript';
export { VideoPlayer, type VideoSeek } from './video-player';
import styles from '../block-layout.module.css';

type Media = Extract<LearningBlock, { type: 'audio' | 'video' }>;
export function MediaBlock(props: LearningBlockViewProps & { block: Media }) {
    const { block, labels } = props;
    const player = useRef<HTMLMediaElement | null>(null);
    const preview = props.variant === 'compact' || props.variant === 'review';
    const [transcriptVisible, setTranscriptVisible] = useState(
        props.variant === 'review',
    );
    const [hintVisible, setHintVisible] = useState(false);
    const [failed, setFailed] = useState(false);
    const [videoSeek, setVideoSeek] = useState<VideoSeek>();
    const [position, setPosition] = useState(0);
    const audioUrl = safeAudioUrl(props.audioUrl);
    const transcript = block.transcript;
    const hasTranscript = transcript !== undefined;
    const hasHint = props.hintTranscript !== undefined;
    const transcriptLabel = transcriptVisible
        ? labels.hideTranscript
        : labels.showTranscript;
    const mediaTitle = block.title ?? labels.kinds[block.type];
    const previewTranscript =
        props.variant === 'compact' && transcript
            ? { ...transcript, segments: transcript.segments.slice(0, 2) }
            : transcript;
    function handlePosition(seconds: number) {
        setPosition(seconds);
    }
    function handlePlaybackStart(pause: () => void) {
        setFailed(false);
        if (props.playback?.onMediaStart)
            props.playback.onMediaStart({
                id: `${props.scope ?? block.id}:${block.id}:media`,
                pause,
            });
        else props.playback?.onStop?.();
    }
    function handleFailure() {
        setFailed(true);
    }
    function handleTranscript() {
        if (props.interactionsDisabled) return;
        if (!transcriptVisible)
            props.onInteraction?.(block.id, { kind: 'transcript-revealed' });
        setTranscriptVisible(!transcriptVisible);
    }
    function handleHint() {
        if (props.interactionsDisabled) return;
        if (!hintVisible)
            props.onInteraction?.(block.id, { kind: 'hint-used' });
        setHintVisible(!hintVisible);
    }
    function handlePlayer(element: HTMLMediaElement | null) {
        player.current = element;
    }
    function handleReplay(seconds: number) {
        if (!Number.isFinite(seconds) || seconds < 0) return;
        if (block.type === 'video' && block.source.kind === 'youtube') {
            setVideoSeek((prior) => ({
                seconds,
                revision: (prior?.revision ?? 0) + 1,
            }));
            return;
        }
        if (!player.current) return;
        player.current.currentTime = seconds;
        void player.current.play().catch(handleFailure);
    }
    let media;
    if (block.type === 'audio') {
        media =
            audioUrl && props.variant !== undefined ? (
                <AudioPlayer
                    src={audioUrl}
                    title={mediaTitle}
                    labels={labels}
                    mediaRef={handlePlayer}
                    onError={handleFailure}
                    onPosition={handlePosition}
                    onStart={handlePlaybackStart}
                />
            ) : audioUrl ? (
                <audio
                    aria-label={mediaTitle}
                    ref={handlePlayer}
                    className={styles.media}
                    controls
                    preload='none'
                    src={audioUrl}
                    onError={handleFailure}
                />
            ) : (
                <p role='status' className={mediaStyles.unprepared}>
                    {block.assetId
                        ? labels.mediaUnavailable
                        : (labels.noRecording ?? labels.mediaUnavailable)}
                </p>
            );
    } else {
        media = (
            <VideoPlayer
                source={block.source}
                title={mediaTitle}
                seek={videoSeek}
                mediaRef={handlePlayer}
                onError={handleFailure}
                unavailableLabel={labels.mediaUnavailable}
                openSourceLabel={labels.openVideoSource}
                deferPlayback={props.variant !== undefined}
                playLabel={labels.play ?? labels.replay}
                onPlaybackStart={handlePlaybackStart}
            />
        );
    }
    const showPreparedTranscript =
        preview && (block.type === 'audio' || props.variant === 'review');
    let sourceUrl: string | undefined;
    if (block.type === 'video') {
        if (block.source.kind === 'youtube')
            sourceUrl = `https://www.youtube.com/watch?v=${block.source.videoId}`;
        else sourceUrl = block.source.url;
    }
    const sourceHost = sourceUrl ? new URL(sourceUrl).hostname : undefined;
    const canReplay = block.type === 'video' || Boolean(audioUrl);
    return (
        <div className={styles.stack}>
            {media}
            {failed ? (
                <p role='alert' className={styles.error}>
                    {labels.mediaUnavailable}
                </p>
            ) : null}
            {block.type === 'video' &&
            block.description &&
            props.variant !== 'compact' ? (
                <p className={mediaStyles.description}>{block.description}</p>
            ) : null}
            {sourceUrl && props.variant !== undefined ? (
                <div className={mediaStyles.source}>
                    <span>{sourceHost}</span>
                    <a
                        href={sourceUrl}
                        target='_blank'
                        rel='noopener noreferrer nofollow'
                    >
                        {labels.openVideoSource}
                    </a>
                </div>
            ) : null}
            {!transcript && labels.missingTranscript ? (
                <p className={mediaStyles.description}>
                    {labels.missingTranscript}
                </p>
            ) : null}
            {block.type === 'video' &&
            (props.variant === 'author' || props.variant === 'review') &&
            labels.videoNotWatched ? (
                <p className={mediaStyles.description}>
                    {labels.videoNotWatched}
                </p>
            ) : null}
            {!preview ? (
                <div className={styles.actions}>
                    {hasTranscript ? (
                        <Button
                            type='button'
                            variant='secondary'
                            onClick={handleTranscript}
                            aria-expanded={transcriptVisible}
                            disabled={props.interactionsDisabled}
                        >
                            {transcriptLabel}
                        </Button>
                    ) : null}
                    {hasHint ? (
                        <Button
                            type='button'
                            variant='secondary'
                            onClick={handleHint}
                            aria-expanded={hintVisible}
                            disabled={props.interactionsDisabled}
                        >
                            {labels.hint}
                        </Button>
                    ) : null}
                </div>
            ) : null}
            {(transcriptVisible || showPreparedTranscript) &&
            previewTranscript ? (
                <Transcript
                    transcript={previewTranscript}
                    position={position}
                    replayLabel={labels.replay}
                    onReplay={canReplay ? handleReplay : undefined}
                />
            ) : null}
            {hintVisible && props.hintTranscript ? (
                <Transcript
                    transcript={props.hintTranscript}
                    replayLabel={labels.replay}
                    onReplay={canReplay ? handleReplay : undefined}
                />
            ) : null}
        </div>
    );
}
