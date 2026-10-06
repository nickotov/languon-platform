import React from 'react'
import { BookmarkIcon, LightbulbIcon } from 'lucide-react'
import type { PracticeExercise } from '../../types/practice'

/** Non-colour legend for required vs extra help, plus what the learner has opened. */
export function HintLegend({ exercise, seenHints }: { exercise: PracticeExercise; seenHints: string[] }) {
  const required = exercise.hints.filter((hint) => hint.role === 'required')
  const context = exercise.hints.filter((hint) => hint.role === 'context')
  const opened = exercise.hints.filter((hint) => seenHints.includes(hint.id))

  return (
    <div className="mt-4 space-y-2 border-t border-border-default pt-3 text-xs text-text-secondary">
      <ul className="flex flex-wrap gap-x-4 gap-y-1" aria-label="Hint legend">
        <li className="inline-flex items-center gap-1.5">
          <BookmarkIcon aria-hidden className="h-3.5 w-3.5 text-primary-default" />
          <span className="font-semibold text-text-primary underline decoration-primary-default decoration-2 underline-offset-4">Bold, solid</span>
          = required dictionary word ({required.length})
        </li>
        {context.length > 0 ? (
          <li className="inline-flex items-center gap-1.5">
            <LightbulbIcon aria-hidden className="h-3.5 w-3.5" />
            <span className="text-text-primary underline decoration-text-tertiary decoration-dashed underline-offset-4">Dashed</span>
            = extra help ({context.length})
          </li>
        ) : (
          <li>This saved example has dictionary hints only.</li>
        )}
        <li>Select, tap or Tab to a marked word to see its hint.</li>
      </ul>
      {opened.length > 0 ? (
        <p>
          <span className="font-medium text-text-primary">Hints opened:</span>{' '}
          {opened.map((hint, index) => (
            <span key={hint.id}>
              <span lang={exercise.responseLanguage}>{hint.gloss}</span>
              {index < opened.length - 1 ? ', ' : ''}
            </span>
          ))}{' '}
          · free, no effect on your score
        </p>
      ) : null}
    </div>
  )
}

