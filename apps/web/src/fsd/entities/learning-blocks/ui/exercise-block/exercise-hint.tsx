import { useRef, useState } from 'react';
import { VideoLearningBlockSchema } from '@languon/contracts';
import type { LearningBlockViewProps } from '../../types';
import { safeAudioUrl } from '../../lib/safe-audio-url';
import {
    Transcript,
    VideoPlayer,
    type VideoSeek,
} from '../media-block/media-block';
import styles from './exercise-block.module.css';

export function ExerciseHint(
    props: Pick<
        LearningBlockViewProps,
        | 'audioUrl'
        | 'hintTranscript'
        | 'hintVideoSource'
        | 'labels'
        | 'playback'
        | 'scope'
    > & { hint?: string | undefined },
) {
    const player = useRef<HTMLMediaElement | null>(null);
    const [seek, setSeek] = useState<VideoSeek>();
    const [failed, setFailed] = useState(false);
    const audioUrl = safeAudioUrl(props.audioUrl);
    const parsed = VideoLearningBlockSchema.shape.source.safeParse(
        props.hintVideoSource,
    );
    const video = parsed.success ? parsed.data : undefined;
    function handlePlaybackStart(pause: () => void) {
        if (props.playback?.onMediaStart)
            props.playback.onMediaStart({
                id: `${props.scope ?? 'exercise'}:hint`,
                pause,
            });
        else props.playback?.onStop?.();
    }
    function pauseAudio() {
        player.current?.pause();
    }
    function handleAudioPlay() {
        handlePlaybackStart(pauseAudio);
    }
    function handleFailure() {
        setFailed(true);
    }
    function handlePlayer(element: HTMLMediaElement | null) {
        player.current = element;
    }
    function handleReplay(seconds: number) {
        if (!Number.isFinite(seconds) || seconds < 0) return;
        if (video?.kind === 'youtube') {
            setSeek((prior) => ({
                seconds,
                revision: (prior?.revision ?? 0) + 1,
            }));
            return;
        }
        if (!player.current) return;
        player.current.currentTime = seconds;
        void player.current.play().catch(handleFailure);
    }
    const onReplay = audioUrl || video ? handleReplay : undefined;
    const title = `${props.labels.hint}: ${props.labels.kinds.video}`;
    return (
        <div className={styles.hint}>
            <p className={styles.feedbackTitle}>{props.labels.hint}</p>
            {props.hint ? <p>{props.hint}</p> : null}
            {audioUrl ? (
                <audio
                    ref={handlePlayer}
                    controls
                    preload='none'
                    src={audioUrl}
                    aria-label={props.labels.hint}
                    onError={handleFailure}
                    onPlay={handleAudioPlay}
                />
            ) : null}
            {video ? (
                <VideoPlayer
                    source={video}
                    title={title}
                    seek={seek}
                    mediaRef={handlePlayer}
                    onError={handleFailure}
                    unavailableLabel={props.labels.mediaUnavailable}
                    openSourceLabel={props.labels.openVideoSource}
                    onPlaybackStart={handlePlaybackStart}
                />
            ) : null}
            {failed ? (
                <p role='alert'>{props.labels.mediaUnavailable}</p>
            ) : null}
            {props.hintTranscript ? (
                <Transcript
                    transcript={props.hintTranscript}
                    replayLabel={props.labels.replay}
                    onReplay={onReplay}
                />
            ) : null}
        </div>
    );
}
