import React, { useEffect, useState } from 'react';
import { AlertCircleIcon, Loader2Icon, PauseIcon, PlayIcon, RotateCcwIcon } from 'lucide-react';
import type { AudioBlock } from '../../../types/blocks';
import { useBlockRuntime } from '../../../contexts/BlockRuntimeContext';
import { bs } from '../../../data/blockStrings';

interface AudioPlayerProps {
  block: AudioBlock;
  scope: string;
  compact?: boolean;
  /** Reports the playback position so the transcript can mark the current line. */
  onPosition?: (seconds: number) => void;
}

/**
 * Prototype player: the recording is simulated with the browser voice reading the transcript,
 * while the position advances in real time. One active playback target across the sheet and chat.
 */
export function AudioPlayer({ block, scope, compact, onPosition }: AudioPlayerProps) {
  const rt = useBlockRuntime();
  const id = `${scope}:${block.id}:rec`;
  const duration = block.media?.duration ?? 0;
  const [pos, setPos] = useState(0);
  const state = rt.playing?.id === id ? rt.playing.status : 'idle';

  useEffect(() => {
    if (state !== 'playing') return;
    const t = window.setInterval(() => setPos((p) => Math.min(duration, p + 0.25)), 250);
    return () => window.clearInterval(t);
  }, [state, duration]);

  const { stop } = rt;
  useEffect(() => {
    if (state === 'playing' && pos >= duration) stop();
  }, [state, pos, duration, stop]);

  useEffect(() => onPosition?.(pos), [pos, onPosition]);

  if (!block.media) {
    return <p className="rounded-lg bg-background-subtle px-3 py-2 text-sm text-text-secondary">{bs.audio.noAudio}</p>;
  }

  const fromHere = () => {
    const start = pos >= duration ? 0 : pos;
    if (pos >= duration) setPos(0);
    const rest = block.transcript.filter((l) => (l.start ?? 0) >= start - 0.01);
    rt.play(id, (rest.length ? rest : block.transcript).map((l) => l.text.replace(/^—\s*/, '')).join(' '));
  };

  const h = rt.touch ? 'h-11 w-11' : 'h-9 w-9';
  return (
    <div className={`flex items-center gap-3 rounded-xl bg-background-subtle ${compact ? 'px-2 py-1.5' : 'px-2.5 py-2'}`}>
      <button
        type="button"
        onClick={() => (state === 'playing' || state === 'preparing' ? rt.stop() : fromHere())}
        aria-label={state === 'playing' ? bs.audio.pause : state === 'unavailable' ? `${bs.audio.unavailable} ${bs.audio.retry}` : `${bs.audio.play} · ${block.title}`}
        className={`inline-flex shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${h} ${
          state === 'unavailable' ? 'bg-warning-subtle text-warning-default' : 'bg-primary-default text-background-surface hover:bg-primary-hover'
        }`}
      >
        {state === 'preparing' ? (
          <Loader2Icon className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : state === 'playing' ? (
          <PauseIcon className="h-4 w-4" aria-hidden="true" />
        ) : state === 'unavailable' ? (
          <RotateCcwIcon className="h-4 w-4" aria-hidden="true" />
        ) : (
          <PlayIcon className="ml-0.5 h-4 w-4" aria-hidden="true" />
        )}
      </button>
      <div className="min-w-0 flex-1">
        <input
          type="range"
          min={0}
          max={duration}
          step={1}
          value={Math.round(pos)}
          onChange={(e) => {
            if (state === 'playing') rt.stop();
            setPos(Number(e.target.value));
          }}
          aria-label={bs.audio.seek}
          aria-valuetext={`${bs.time(pos)} / ${bs.time(duration)}`}
          className="h-1.5 w-full cursor-pointer accent-primary-600"
        />
        <div className="mt-0.5 flex items-center justify-between gap-2 text-xs text-text-tertiary">
          <span className="truncate">
            {state === 'unavailable' ? (
              <span className="inline-flex items-center gap-1 text-warning-default">
                <AlertCircleIcon className="h-3 w-3" aria-hidden="true" />
                {bs.audio.unavailable}
              </span>
            ) : block.media.kind === 'upload' ? (
              bs.audio.uploaded(block.media.name)
            ) : (
              bs.audio.generated
            )}
          </span>
          <span className="shrink-0 tabular-nums">
            {bs.time(pos)} / {bs.time(duration)}
          </span>
        </div>
      </div>
    </div>
  );
}

