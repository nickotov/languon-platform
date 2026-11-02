import React from 'react';
import type { BlockVariant, ExercisesBlock } from '../../../types/blocks';
import { useBlockRuntime } from '../../../contexts/BlockRuntimeContext';
import { ExerciseItemView } from './ExerciseItemView';
import { ru } from '../../../data/strings';
import { bs } from '../../../data/blockStrings';

interface ExercisesViewProps {
  block: ExercisesBlock;
  variant: BlockVariant;
}

/**
 * Compact / review show the material an author needs to judge (task, choices, reference answer, explanation)
 * without solving it. Author and learner views are playable inline.
 */
export function ExercisesView({ block, variant }: ExercisesViewProps) {
  const rt = useBlockRuntime();

  if (variant === 'compact' || variant === 'review') {
    return (
      <ol className="divide-y divide-border-default">
        {block.items.map((item, i) => (
          <li key={item.id} className={variant === 'compact' ? 'py-1.5' : 'py-2.5'}>
            <p className="flex gap-2 text-sm text-text-primary">
              <span className="w-4 shrink-0 text-text-tertiary">{i + 1}.</span>
              <span className="min-w-0">
                {item.prompt} <span className="text-xs text-text-tertiary">· {ru.exercise.kinds[item.kind]}</span>
              </span>
            </p>
            {variant === 'review' && item.choices && <p className="ml-6 mt-0.5 text-sm text-text-secondary">{item.choices.join(' · ')}</p>}
            <p className="ml-6 mt-0.5 text-sm">
              <span className="text-text-tertiary">{ru.exercise.referenceAnswer}: </span>
              <span lang="fr" className="font-medium text-text-primary">
                {item.answer}
              </span>
            </p>
            {variant === 'review' && (
              <>
                {item.alternatives?.length ? (
                  <p className="ml-6 text-sm text-text-secondary">
                    {ru.exercise.alternatives}: {item.alternatives.join(' / ')}
                  </p>
                ) : null}
                <p className="ml-6 text-sm leading-6 text-text-secondary">{item.explanation}</p>
                {item.hint && (
                  <p className="ml-6 text-sm text-text-tertiary">
                    {ru.exercise.hintLabel}: {item.hint}
                  </p>
                )}
                {item.grounding && (
                  <p className="ml-6 text-sm text-text-tertiary">
                    {bs.exercise.groundedIn}
                    {item.grounding.start !== undefined && ` · ${bs.time(item.grounding.start)}`}:{' '}
                    <span lang="fr" className="italic text-text-secondary">
                      {item.grounding.passage}
                    </span>
                  </p>
                )}
              </>
            )}
          </li>
        ))}
      </ol>
    );
  }

  const ids = block.items.map((i) => i.id);
  const attempted = block.items.filter((i) => {
    const a = rt.attempts[i.id];
    return a && a.version === i.version && a.submitted;
  }).length;
  const allOpen = ids.every((id) => rt.expanded[id]);

  return (
    <div>
      <div className="flex items-center justify-between gap-2 pb-1">
        <p className="text-xs text-text-tertiary">
          {ru.exercise.summary(attempted, block.items.length)}
          {variant === 'learner' && <> · {rt.role === 'anonymous' ? bs.exercise.anonymous : ru.exercise.privateNote}</>}
        </p>
        <button
          type="button"
          onClick={() => rt.setExpanded(ids, !allOpen)}
          className={`rounded-md px-2 text-xs font-medium text-text-secondary hover:bg-background-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${rt.touch ? 'h-11' : 'h-7'}`}
        >
          {allOpen ? ru.exercise.collapseAll : ru.exercise.expandAll}
        </button>
      </div>
      <ol className="divide-y divide-border-default">
        {block.items.map((item, i) => (
          <ExerciseItemView key={item.id} item={item} index={i} />
        ))}
      </ol>
    </div>
  );
}

