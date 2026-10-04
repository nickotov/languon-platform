import React, { useEffect, useRef, useState } from 'react'
import { LightbulbIcon } from 'lucide-react'
import type { PracticeExercise } from '../../types/practice'
import { languageDir, languageName } from '../../data/languages'

interface SentenceWithHintsProps {
  exercise: PracticeExercise
  revealedHints: string[]
  onReveal: (targetId: string) => void
  /** Larger type for the focused practice view. */
  size?: 'lg' | 'md'
}

/**
 * The original sentence is the visual focus. Only admitted targets are
 * interactive; repeated occurrences share one hint and one reveal state.
 */
export function SentenceWithHints({
  exercise,
  revealedHints,
  onReveal,
  size = 'lg',
}: SentenceWithHintsProps) {
  const [openTarget, setOpenTarget] = useState<{ id: string; index: number } | null>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const dir = languageDir(exercise.sourceLanguage)

  useEffect(() => {
    if (!openTarget) return undefined
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpenTarget(null)
    }
    document.addEventListener('mousedown', onPointer)
    return () => document.removeEventListener('mousedown', onPointer)
  }, [openTarget])

  const toggle = (targetId: string, index: number) => {
    onReveal(targetId)
    setOpenTarget((prev) => (prev && prev.index === index ? null : { id: targetId, index }))
  }

  const usedHints = exercise.targets.filter((target) => revealedHints.includes(target.id))

  return (
    <div ref={rootRef}>
      <p
        dir={dir}
        lang={exercise.sourceLanguage}
        className={`break-words font-medium leading-relaxed text-text-primary ${
          size === 'lg' ? 'text-2xl md:text-[1.75rem]' : 'text-xl'
        }`}
      >
        {exercise.segments.map((segment, index) => {
          if (!segment.targetId) return <span key={index}>{segment.text}</span>
          const target = exercise.targets.find((item) => item.id === segment.targetId)
          if (!target) return <span key={index}>{segment.text}</span>
          const revealed = revealedHints.includes(target.id)
          const isOpen = openTarget?.index === index
          const popoverId = `hint-${exercise.id}-${index}`
          return (
            <span key={index} className="relative inline">
              <button
                type="button"
                aria-expanded={isOpen}
                aria-controls={isOpen ? popoverId : undefined}
                aria-label={`${segment.text} — ${revealed ? 'hint shown' : 'show hint'}`}
                onClick={() => toggle(target.id, index)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape' && isOpen) {
                    event.stopPropagation()
                    setOpenTarget(null)
                  }
                }}
                className={`rounded-sm underline decoration-2 underline-offset-[6px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background-surface ${
                  revealed
                    ? 'bg-primary-subtle decoration-solid decoration-primary-default'
                    : 'decoration-dotted decoration-primary-default hover:bg-primary-subtle'
                }`}
              >
                {segment.text}
              </button>
              {isOpen ? (
                <span
                  id={popoverId}
                  role="dialog"
                  aria-label={`Hint for ${segment.text}`}
                  dir="ltr"
                  className="absolute start-0 top-full z-30 mt-2 block w-max max-w-[16rem] rounded-xl border border-border-default bg-background-elevated p-3 text-start shadow-lg"
                >
                  <span className="block text-[11px] font-medium uppercase tracking-wide text-text-tertiary">
                    {target.kind === 'phrase' ? 'Phrase' : 'Word'} ·{' '}
                    {languageName(exercise.responseLanguage)}
                  </span>
                  <span
                    lang={exercise.responseLanguage}
                    dir={languageDir(exercise.responseLanguage)}
                    className="mt-1 block text-base font-semibold text-text-primary"
                  >
                    {target.hint}
                  </span>
                  <span className="mt-1 block text-xs font-normal leading-snug text-text-secondary">
                    Dictionary mapping for this exercise. Hints are free and never lower your
                    grade.
                  </span>
                </span>
              ) : null}
            </span>
          )
        })}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="inline-flex items-center gap-1.5 text-text-secondary">
          <LightbulbIcon aria-hidden className="h-4 w-4" />
          {usedHints.length === 0
            ? `${exercise.targets.length} target ${
                exercise.targets.length === 1 ? 'word has' : 'words have'
              } a hint — select an underlined word.`
            : 'Hints shown:'}
        </span>
        {usedHints.map((target) => (
          <span
            key={target.id}
            className="inline-flex items-center gap-1 rounded-lg border border-border-default bg-background-subtle px-2 py-0.5 text-text-primary"
          >
            <span lang={exercise.responseLanguage}>{target.hint}</span>
          </span>
        ))}
      </div>
    </div>
  )
}

