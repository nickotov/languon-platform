import React from 'react';
import { AlertCircleIcon, Loader2Icon, SquareIcon, Volume2Icon } from 'lucide-react';
import { useBlockRuntime } from '../../contexts/BlockRuntimeContext';
import { Tooltip } from '../Tooltip';
import { ru } from '../../data/strings';

interface PlayButtonProps {
  /** Stable playback target id (one active target at a time). */
  id: string;
  text: string;
  label: string;
  size?: 'sm' | 'md';
}

/** Model pronunciation playback — the Dictionary pattern. It never assesses the learner's speech. */
export function PlayButton({ id, text, label, size = 'sm' }: PlayButtonProps) {
  const { playing, play, stop, touch } = useBlockRuntime();
  const state = playing?.id === id ? playing.status : 'idle';
  const dim = touch ? 'h-11 w-11' : size === 'sm' ? 'h-7 w-7' : 'h-8 w-8';
  const tip = state === 'playing' ? ru.vocab.stop : state === 'preparing' ? ru.vocab.preparing : state === 'unavailable' ? ru.vocab.unavailable : label;

  return (
    <span className="inline-flex items-center">
      <Tooltip content={tip} placement="top">
        <button
          type="button"
          aria-label={state === 'playing' ? ru.vocab.stop : state === 'unavailable' ? `${label}. ${ru.vocab.unavailable} ${ru.vocab.retryPlay}` : label}
          aria-pressed={state === 'playing'}
          onClick={() => (state === 'playing' || state === 'preparing' ? stop() : play(id, text))}
          className={`inline-flex shrink-0 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${dim} ${
            state === 'playing'
              ? 'bg-primary-subtle text-primary-default'
              : state === 'unavailable'
                ? 'text-warning-default hover:bg-warning-subtle'
                : 'text-text-tertiary hover:bg-background-subtle hover:text-text-primary'
          }`}
        >
          {state === 'preparing' ? (
            <Loader2Icon className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : state === 'playing' ? (
            <SquareIcon className="h-3 w-3 fill-current" aria-hidden="true" />
          ) : state === 'unavailable' ? (
            <AlertCircleIcon className="h-3.5 w-3.5" aria-hidden="true" />
          ) : (
            <Volume2Icon className="h-3.5 w-3.5" aria-hidden="true" />
          )}
        </button>
      </Tooltip>
      {state === 'unavailable' && (
        <span role="status" className="sr-only">
          {ru.vocab.unavailable}
        </span>
      )}
    </span>
  );
}

