import { useRef, useState, type ChangeEvent } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { IconButton } from '@/fsd/shared/ui/icon-button/icon-button';
import type { LearningBlockLabels } from '../../types';
import styles from './media-block.module.css';

const time = (seconds: number) =>
    `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export function AudioPlayer({
    src,
    title,
    labels,
    mediaRef,
    onError,
    onPosition,
    onStart,
}: {
    src: string;
    title: string;
    labels: LearningBlockLabels;
    mediaRef: (element: HTMLAudioElement | null) => void;
    onError: () => void;
    onPosition: (seconds: number) => void;
    onStart?: ((pause: () => void) => void) | undefined;
}) {
    const audio = useRef<HTMLAudioElement | null>(null);
    const [playing, setPlaying] = useState(false);
    const [pending, setPending] = useState(false);
    const [failed, setFailed] = useState(false);
    const [position, setPosition] = useState(0);
    const [duration, setDuration] = useState(0);
    function assign(element: HTMLAudioElement | null) {
        audio.current = element;
        mediaRef(element);
    }
    function failure() {
        setFailed(true);
        setPlaying(false);
        setPending(false);
        onError();
    }
    function start() {
        setPlaying(true);
        setPending(false);
        onStart?.(pausePlayback);
    }
    function pausePlayback() {
        audio.current?.pause();
    }
    function pause() {
        setPlaying(false);
    }
    function metadata() {
        const value = audio.current?.duration;
        if (value && Number.isFinite(value)) setDuration(value);
    }
    function progress() {
        const value = audio.current?.currentTime ?? 0;
        setPosition(value);
        onPosition(value);
    }
    function seek(event: ChangeEvent<HTMLInputElement>) {
        if (audio.current)
            audio.current.currentTime = Number(event.target.value);
        progress();
    }
    function toggle() {
        if (!audio.current) return;
        if (playing) {
            audio.current.pause();
            return;
        }
        setFailed(false);
        setPending(true);
        void audio.current
            .play()
            .then(() => setPending(false))
            .catch(failure);
    }
    const icon = playing ? <Pause size={16} /> : <Play size={16} />;
    const actionIcon = failed ? <RotateCcw size={16} /> : icon;
    let playLabel = `${labels.play ?? labels.replay}: ${title}`;
    if (playing) playLabel = labels.stop ?? labels.retry;
    if (failed) playLabel = labels.retry;
    return (
        <div className={styles.audioPlayer}>
            <audio
                ref={assign}
                src={src}
                preload='metadata'
                aria-label={title}
                onError={failure}
                onLoadedMetadata={metadata}
                onTimeUpdate={progress}
                onPlay={start}
                onPause={pause}
                onEnded={pause}
            />
            <IconButton
                className={styles.audioPlay}
                variant='primary'
                size='small'
                label={playLabel}
                loading={pending}
                icon={actionIcon}
                onClick={toggle}
            />
            <div className={styles.audioBody}>
                <input
                    className={styles.seek}
                    type='range'
                    min={0}
                    max={duration}
                    step={0.1}
                    value={position}
                    aria-label={labels.replay}
                    aria-valuetext={`${time(position)} / ${time(duration)}`}
                    onChange={seek}
                    disabled={!duration}
                />
                <div className={styles.audioMeta}>
                    <span>{failed ? labels.mediaUnavailable : title}</span>
                    <span>
                        {time(position)} / {time(duration)}
                    </span>
                </div>
            </div>
        </div>
    );
}
