import { useEffect, useRef, useState, type Ref } from 'react';
import { Play } from 'lucide-react';
import { VideoLearningBlockSchema } from '@languon/contracts';
import type { VideoReplaySource } from '../../types';
import styles from '../block-layout.module.css';
import mediaStyles from './media-block.module.css';

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
    deferPlayback = false,
    playLabel,
    onPlaybackStart,
}: {
    source: VideoReplaySource;
    title: string;
    seek?: VideoSeek | undefined;
    mediaRef?: Ref<HTMLVideoElement> | undefined;
    onError?: (() => void) | undefined;
    unavailableLabel: string;
    openSourceLabel: string;
    deferPlayback?: boolean | undefined;
    playLabel?: string | undefined;
    onPlaybackStart?: ((pause: () => void) => void) | undefined;
}) {
    const [failed, setFailed] = useState(false);
    const [started, setStarted] = useState(!deferPlayback);
    const video = useRef<HTMLVideoElement | null>(null);
    const [suspended, setSuspended] = useState<{ at: number | undefined }>();
    function assignPlayer(element: HTMLVideoElement | null) {
        video.current = element;
        if (typeof mediaRef === 'function') mediaRef(element);
        else if (mediaRef) mediaRef.current = element;
    }
    function pausePlayback() {
        video.current?.pause();
        setSuspended({ at: seek?.revision });
    }
    function notifyPlay() {
        onPlaybackStart?.(pausePlayback);
    }
    const playbackStart = useRef(onPlaybackStart);
    playbackStart.current = onPlaybackStart;
    const pauseCurrent = useRef(pausePlayback);
    pauseCurrent.current = pausePlayback;
    const seekRevision = seek?.revision;
    useEffect(() => {
        if (seekRevision !== undefined)
            playbackStart.current?.(pauseCurrent.current);
    }, [seekRevision]);
    function handleStart() {
        setStarted(true);
        setSuspended(undefined);
        notifyPlay();
    }
    function handleFailure() {
        setFailed(true);
        onError?.();
    }
    const validated = VideoLearningBlockSchema.shape.source.safeParse(source);
    if (!validated.success) return <p role='status'>{unavailableLabel}</p>;
    const safeSource = validated.data;
    const videoClass = `${styles.media} ${styles.video}`;
    const unsupported =
        safeSource.kind === 'url' &&
        !/\.(mp4|webm|ogv|ogg|mov|m4v)$/iu.test(
            new URL(safeSource.url).pathname,
        );
    if (deferPlayback && unsupported && safeSource.kind === 'url')
        return (
            <a href={safeSource.url} target='_blank' rel='noopener noreferrer'>
                {openSourceLabel}
            </a>
        );
    const stopped = suspended !== undefined && suspended.at === seek?.revision;
    if (stopped || (!started && !seek))
        return (
            <button
                type='button'
                className={mediaStyles.poster}
                onClick={handleStart}
                aria-label={playLabel ?? title}
            >
                <span className={mediaStyles.posterTitle}>{title}</span>
                <span className={mediaStyles.posterPlay}>
                    <Play size={20} aria-hidden='true' />
                </span>
            </button>
        );
    if (safeSource.kind === 'url')
        return (
            <>
                <video
                    aria-label={title}
                    ref={assignPlayer}
                    className={videoClass}
                    controls
                    autoPlay={deferPlayback && started}
                    preload='none'
                    src={safeSource.url}
                    onError={handleFailure}
                    onPlay={notifyPlay}
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
