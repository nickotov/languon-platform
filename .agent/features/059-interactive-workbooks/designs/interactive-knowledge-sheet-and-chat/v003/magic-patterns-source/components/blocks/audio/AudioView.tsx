import React, { useCallback, useState } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import type { AudioBlock, BlockVariant, ExercisesBlock } from '../../../types/blocks';
import { useBlockRuntime } from '../../../contexts/BlockRuntimeContext';
import { ExercisesView } from '../exercises/ExercisesView';
import { AudioPlayer } from './AudioPlayer';
import { bs } from '../../../data/blockStrings';

interface AudioViewProps {
  block: AudioBlock;
  variant: BlockVariant;
  scope: string;
}

/**
 * Player → transcript (hidden for learners until they ask) → grounded questions.
 * Showing the transcript, using a hint and revealing an answer are separate actions.
 */
export function AudioView({ block, variant, scope }: AudioViewProps) {
  const rt = useBlockRuntime();
  const [showTranscript, setShowTranscript] = useState(variant === 'review');
  const [pos, setPos] = useState(0);
  const onPosition = useCallback((s: number) => setPos(s), []);
  const questions: ExercisesBlock = { id: `${block.id}-q`, type: 'exercises', title: block.title, items: block.questions };
  const compact = variant === 'compact';
  const playingThis = rt.playing?.id === `${scope}:${block.id}:rec` && rt.playing.status === 'playing';
  const activeLine = playingThis ? [...block.transcript].reverse().find((l) => l.start !== undefined && l.start <= pos)?.id : undefined;
  const lines = compact ? block.transcript.slice(0, 2) : block.transcript;

  return (
    <div className="space-y-3 py-1">
      <AudioPlayer block={block} scope={scope} compact={compact} onPosition={onPosition} />

      {block.transcript.length === 0 ? (
        <p className="text-sm text-text-tertiary">{bs.audio.noTranscript}</p>
      ) : compact || variant === 'review' ? (
        <div>
          <p className="text-xs font-semibold text-text-tertiary">{bs.audio.transcript}</p>
          <ol className="mt-1 space-y-0.5">
            {lines.map((l) => (
              <li key={l.id} className="flex gap-2 text-sm leading-6">
                {l.start !== undefined && <span className="w-9 shrink-0 tabular-nums text-xs leading-6 text-text-tertiary">{bs.time(l.start)}</span>}
                <span lang="fr" className="text-text-primary">
                  {l.text}
                </span>
              </li>
            ))}
          </ol>
          {compact && block.transcript.length > lines.length && <p className="text-xs text-text-tertiary">…</p>}
        </div>
      ) : (
        <div>
          <button
            type="button"
            aria-expanded={showTranscript}
            aria-controls={`${scope}-${block.id}-transcript`}
            onClick={() => setShowTranscript((s) => !s)}
            className={`inline-flex items-center gap-1.5 rounded-md px-2 text-xs font-medium text-text-secondary hover:bg-background-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${rt.touch ? 'h-11' : 'h-7'} -ml-2`}
          >
            <ChevronDownIcon className={`h-3.5 w-3.5 transition-transform duration-150 ${showTranscript ? 'rotate-180' : ''}`} aria-hidden="true" />
            {showTranscript ? bs.audio.hideTranscript : bs.audio.showTranscript}
          </button>
          {showTranscript && (
            <ol id={`${scope}-${block.id}-transcript`} className="mt-1 space-y-0.5 border-l-2 border-border-default pl-3">
              {block.transcript.map((l) => (
                <li key={l.id} className={`flex gap-2 rounded text-base leading-7 ${activeLine === l.id ? 'bg-primary-subtle' : ''}`} aria-current={activeLine === l.id ? 'true' : undefined}>
                  {l.start !== undefined && <span className="w-9 shrink-0 pt-0.5 tabular-nums text-xs leading-6 text-text-tertiary">{bs.time(l.start)}</span>}
                  <span lang="fr" className="text-text-primary">
                    {l.text}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {block.questions.length > 0 &&
        (compact ? (
          <p className="text-xs text-text-tertiary">
            {bs.audio.questions} · {bs.counts.questions(block.questions.length)}
          </p>
        ) : (
          <div>
            <p className="pb-0.5 text-xs font-semibold text-text-tertiary">{bs.audio.questions}</p>
            <ExercisesView block={questions} variant={variant} />
          </div>
        ))}
    </div>
  );
}

