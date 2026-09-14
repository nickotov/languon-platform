'use client';
import {
    AlertCircleIcon,
    LoaderIcon,
    PauseIcon,
    PlayIcon,
    RotateCcwIcon,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './audio-player.module.css';
export type AudioPlayerSize = 'sm' | 'md';
export type AudioPlayerProps = {
    src: string;
    label?: string;
    speeds?: number[];
    defaultSpeed?: number;
    replaySeconds?: number;
    autoPlay?: boolean;
    size?: AudioPlayerSize;
    disabled?: boolean;
    className?: string;
    onPlay?: () => void;
    onPause?: () => void;
    onEnded?: () => void;
    onSpeedChange?: (speed: number) => void;
};
type Status = 'loading' | 'ready' | 'error';
export function formatTime(seconds: number) {
    if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
    const total = Math.floor(seconds);
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
export function AudioPlayer({
    src,
    label,
    speeds = [1, 0.75, 0.5],
    defaultSpeed,
    replaySeconds = 5,
    autoPlay = false,
    size = 'md',
    disabled = false,
    className,
    onPlay,
    onPause,
    onEnded,
    onSpeedChange,
}: AudioPlayerProps) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [status, setStatus] = useState<Status>('loading');
    const [playing, setPlaying] = useState(false);
    const [current, setCurrent] = useState(0);
    const [duration, setDuration] = useState(0);
    const [speed, setSpeed] = useState(defaultSpeed ?? speeds[0] ?? 1);
    const interactive = status === 'ready' && !disabled;
    const progress = useMemo(
        () => (duration ? Math.min(100, (current / duration) * 100) : 0),
        [current, duration],
    );
    useEffect(() => {
        setStatus('loading');
        setPlaying(false);
        setCurrent(0);
        setDuration(0);
    }, [src]);
    useEffect(() => {
        if (audioRef.current) audioRef.current.playbackRate = speed;
    }, [speed, status]);
    const toggle = useCallback(() => {
        const a = audioRef.current;
        if (!a || !interactive) return;
        if (a.paused) void a.play().catch(() => setStatus('error'));
        else a.pause();
    }, [interactive]);
    const replay = useCallback(() => {
        const a = audioRef.current;
        if (!a || !interactive) return;
        const next = replaySeconds
            ? Math.max(0, a.currentTime - replaySeconds)
            : 0;
        a.currentTime = next;
        setCurrent(next);
        if (a.paused) void a.play().catch(() => setStatus('error'));
    }, [interactive, replaySeconds]);
    const cycle = () => {
        if (!interactive || !speeds.length) return;
        const next = speeds[(speeds.indexOf(speed) + 1) % speeds.length] ?? 1;
        setSpeed(next);
        onSpeedChange?.(next);
    };
    return (
        <section
            aria-label={label ? `Audio: ${label}` : 'Audio player'}
            className={[
                styles.root,
                styles[size],
                disabled ? styles.disabled : '',
                className,
            ]
                .filter(Boolean)
                .join(' ')}
        >
            <audio
                ref={audioRef}
                src={src}
                preload='metadata'
                autoPlay={autoPlay}
                onLoadedMetadata={(event) => {
                    const a = event.currentTarget;
                    setDuration(Number.isFinite(a.duration) ? a.duration : 0);
                    a.playbackRate = speed;
                    setStatus('ready');
                }}
                onTimeUpdate={(event) =>
                    setCurrent(event.currentTarget.currentTime)
                }
                onPlay={() => {
                    setPlaying(true);
                    onPlay?.();
                }}
                onPause={() => {
                    setPlaying(false);
                    onPause?.();
                }}
                onEnded={() => {
                    setPlaying(false);
                    setCurrent(0);
                    onEnded?.();
                }}
                onError={() => setStatus('error')}
            />
            <button
                type='button'
                onClick={toggle}
                disabled={!interactive}
                aria-label={playing ? 'Pause' : 'Play'}
                className={styles.play}
            >
                {status === 'loading' ? (
                    <LoaderIcon className={styles.spin} />
                ) : status === 'error' ? (
                    <AlertCircleIcon />
                ) : playing ? (
                    <PauseIcon />
                ) : (
                    <PlayIcon />
                )}
            </button>
            <div className={styles.main}>
                {label ? <p className={styles.label}>{label}</p> : null}
                {status === 'error' ? (
                    <p role='alert' className={styles.error}>
                        Audio unavailable
                    </p>
                ) : (
                    <div className={styles.timeline}>
                        <div className={styles.track}>
                            <span style={{ width: `${progress}%` }} />
                            <input
                                type='range'
                                min={0}
                                max={duration || 0}
                                step={0.01}
                                value={current}
                                disabled={!interactive}
                                aria-label='Seek'
                                aria-valuetext={`${formatTime(current)} of ${formatTime(duration)}`}
                                onChange={(event) => {
                                    const value = Number(event.target.value);
                                    if (audioRef.current)
                                        audioRef.current.currentTime = value;
                                    setCurrent(value);
                                }}
                            />
                        </div>
                        <span>
                            {formatTime(current)} / {formatTime(duration)}
                        </span>
                    </div>
                )}
            </div>
            <div className={styles.controls}>
                <button
                    type='button'
                    onClick={replay}
                    disabled={!interactive}
                    aria-label={
                        replaySeconds
                            ? `Replay ${replaySeconds} seconds`
                            : 'Replay from start'
                    }
                >
                    <RotateCcwIcon />
                </button>
                <button
                    type='button'
                    onClick={cycle}
                    disabled={!interactive}
                    aria-label={`Playback speed: ${speed}x. Change speed`}
                    className={speed !== 1 ? styles.speedActive : ''}
                >
                    {speed}×
                </button>
            </div>
        </section>
    );
}
