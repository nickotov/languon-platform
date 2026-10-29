import { useRef, useState, type Ref } from 'react';
import { VideoLearningBlockSchema } from '@languon/contracts';
import type { LearningBlock, LearningTranscript } from '@languon/contracts';
import { Button } from '@/fsd/shared/ui/button/button';
import { safeAudioUrl } from '../../lib/safe-audio-url';
import type { LearningBlockViewProps, VideoReplaySource } from '../../types';
import styles from '../block-layout.module.css';

type Media = Extract<LearningBlock, { type: 'audio' | 'video' }>;
export function MediaBlock(props: LearningBlockViewProps & { block: Media }) {
    const { block, labels } = props;
    const player = useRef<HTMLMediaElement | null>(null);
    const [transcriptVisible, setTranscriptVisible] = useState(false);
    const [hintVisible, setHintVisible] = useState(false);
    const [failed, setFailed] = useState(false);
    const [videoSeek, setVideoSeek] = useState<VideoSeek>();
    const audioUrl = safeAudioUrl(props.audioUrl);
    const transcript = block.transcript;
    const hasTranscript = transcript !== undefined;
    const hasHint = props.hintTranscript !== undefined;
    const transcriptLabel = transcriptVisible
        ? labels.hideTranscript
        : labels.showTranscript;
    const mediaTitle = block.title ?? labels.kinds[block.type];
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
        media = audioUrl ? (
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
            <p role='status'>{labels.mediaUnavailable}</p>
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
            />
        );
    }
    const canReplay = block.type === 'video' || Boolean(audioUrl);
    return (
        <div className={styles.stack}>
            {media}
            {failed ? (
                <p role='alert' className={styles.error}>
                    {labels.mediaUnavailable}
                </p>
            ) : null}
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
            {transcriptVisible && transcript ? (
                <Transcript
                    transcript={transcript}
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

export interface VideoSeek {
    seconds: number;
    revision: number;
}

/** Fixed provider URLs only; seek reloads YouTube without accepting embed HTML or API scripts. */
export function VideoPlayer({
    source,
    title,
    seek,
    mediaRef,
    onError,
    unavailableLabel,
    openSourceLabel,
}: {
    source: VideoReplaySource;
    title: string;
    seek?: VideoSeek | undefined;
    mediaRef?: Ref<HTMLVideoElement> | undefined;
    onError?: (() => void) | undefined;
    unavailableLabel: string;
    openSourceLabel: string;
}) {
    const [failed, setFailed] = useState(false);
    function handleFailure() {
        setFailed(true);
        onError?.();
    }
    const validated = VideoLearningBlockSchema.shape.source.safeParse(source);
    if (!validated.success) return <p role='status'>{unavailableLabel}</p>;
    const safeSource = validated.data;
    const videoClass = `${styles.media} ${styles.video}`;
    if (safeSource.kind === 'url')
        return (
            <>
                <video
                    aria-label={title}
                    ref={mediaRef}
                    className={videoClass}
                    controls
                    preload='none'
                    src={safeSource.url}
                    onError={handleFailure}
                />
                {failed ? (
                    <a
                        href={safeSource.url}
                        target='_blank'
                        rel='noopener noreferrer'
                    >
                        {openSourceLabel}
                    </a>
                ) : null}
            </>
        );
    const seconds =
        seek && Number.isFinite(seek.seconds) && seek.seconds >= 0
            ? Math.floor(seek.seconds)
            : undefined;
    const embedUrl = `https://www.youtube-nocookie.com/embed/${safeSource.videoId}${seconds === undefined ? '' : `?start=${seconds}&autoplay=1`}`;
    return (
        <iframe
            key={seek?.revision ?? 0}
            title={title}
            className={videoClass}
            src={embedUrl}
            loading='lazy'
            referrerPolicy='no-referrer'
            sandbox='allow-scripts allow-same-origin allow-presentation'
            allow='autoplay; encrypted-media; picture-in-picture'
            allowFullScreen
        />
    );
}

export function Transcript({
    transcript,
    replayLabel,
    onReplay,
}: {
    transcript: LearningTranscript;
    replayLabel: string;
    onReplay?: ((seconds: number) => void) | undefined;
}) {
    return (
        <div className={styles.panel} lang={transcript.language} dir='auto'>
            {transcript.segments.map((segment) => (
                <TranscriptSegment
                    key={segment.id}
                    segment={segment}
                    replayLabel={replayLabel}
                    onReplay={onReplay}
                />
            ))}
        </div>
    );
}
function TranscriptSegment({
    segment,
    replayLabel,
    onReplay,
}: {
    segment: LearningTranscript['segments'][number];
    replayLabel: string;
    onReplay?: ((seconds: number) => void) | undefined;
}) {
    function handleReplay() {
        if (segment.timing) onReplay?.(segment.timing.startSeconds);
    }
    const canReplay = segment.timing !== undefined && onReplay !== undefined;
    return (
        <div className={styles.stack}>
            <p className={styles.text}>{segment.text}</p>
            {canReplay ? (
                <div>
                    <Button
                        type='button'
                        variant='ghost'
                        onClick={handleReplay}
                    >
                        {replayLabel}
                    </Button>
                </div>
            ) : null}
        </div>
    );
}
