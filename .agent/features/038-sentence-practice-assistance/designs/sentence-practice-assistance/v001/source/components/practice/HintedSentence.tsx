import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { BookmarkIcon, LightbulbIcon, XIcon } from 'lucide-react'
import type { PracticeExercise, PracticeHint } from '../../types/practice'
import { languageDir, languageName } from '../../data/languages'

interface HintedSentenceProps {
  exercise: PracticeExercise
  /** Hints already opened at least once (shared across repeated occurrences). */
  seenHints: string[]
  onHintSeen: (hintId: string) => void
  /** Gallery: open a specific occurrence on mount. */
  initialOpen?: number
}

interface OpenState {
  index: number
  via: 'hover' | 'explicit'
}

/**
 * The source sentence with individually focusable hint spans. Each visible
 * occurrence is its own trigger; only one popover is open at a time.
 * Spans are inline so long phrases wrap without breaking reading order.
 */
export function HintedSentence({ exercise, seenHints, onHintSeen, initialOpen }: HintedSentenceProps) {
  const [open, setOpen] = useState<OpenState | null>(initialOpen !== undefined ? { index: initialOpen, via: 'explicit' } : null)
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const triggers = useRef<Record<number, HTMLSpanElement | null>>({})
  const hoverTimer = useRef<number>()
  const hintFor = (id?: string) => exercise.hints.find((hint) => hint.id === id)

  const measure = useCallback(() => {
    if (!open || !root.current) return
    const trigger = triggers.current[open.index]
    if (!trigger) return
    const rects = trigger.getClientRects()
    const last = rects[rects.length - 1] ?? trigger.getBoundingClientRect()
    const box = root.current.getBoundingClientRect()
    const width = Math.min(288, box.width)
    const left = Math.max(0, Math.min(last.left - box.left, box.width - width))
    setPosition({ top: last.bottom - box.top + 6, left })
  }, [open])

  useLayoutEffect(measure, [measure])
  useEffect(() => {
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [measure])

  useEffect(() => {
    if (open?.via !== 'explicit') return undefined
    const hint = hintFor(exercise.segments[open.index]?.hintId)
    if (hint) onHintSeen(hint.id)
    const onDown = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const close = (restore: boolean) => {
    const index = open?.index
    setOpen(null)
    if (restore && index !== undefined) triggers.current[index]?.focus()
  }

  const activate = (index: number) =>
    setOpen((prev) => (prev?.index === index && prev.via === 'explicit' ? null : { index, via: 'explicit' }))

  const openSegment = open ? exercise.segments[open.index] : null
  const openHint = hintFor(openSegment?.hintId)
  const sourceDir = languageDir(exercise.sourceLanguage)

  return (
    <div ref={root} className="relative">
      <p
        lang={exercise.sourceLanguage}
        dir={sourceDir}
        className="break-words text-2xl font-normal leading-[1.9] text-text-primary sm:text-[1.75rem]"
      >
        {exercise.segments.map((segment, index) => {
          const hint = hintFor(segment.hintId)
          if (!hint) return <React.Fragment key={index}>{segment.text}</React.Fragment>
          const seen = seenHints.includes(hint.id)
          const active = open?.index === index
          const required = hint.role === 'required'
          return (
            <span
              key={index}
              ref={(node) => {
                triggers.current[index] = node
              }}
              role="button"
              tabIndex={0}
              aria-haspopup="dialog"
              aria-expanded={active && open?.via === 'explicit'}
              aria-label={`${segment.text} — ${required ? 'required dictionary word' : 'extra help'}${seen ? ', hint opened' : ''}. Show hint`}
              onClick={() => activate(index)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault()
                  activate(index)
                }
                if (event.key === 'Escape' && open) {
                  event.stopPropagation()
                  close(true)
                }
              }}
              onMouseEnter={() => {
                window.clearTimeout(hoverTimer.current)
                hoverTimer.current = window.setTimeout(() => setOpen((prev) => (prev?.via === 'explicit' ? prev : { index, via: 'hover' })), 350)
              }}
              onMouseLeave={() => {
                window.clearTimeout(hoverTimer.current)
                setOpen((prev) => (prev?.via === 'hover' ? null : prev))
              }}
              className={`cursor-pointer rounded-sm [box-decoration-break:clone] [-webkit-box-decoration-break:clone] underline-offset-[6px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background-surface ${
                required
                  ? `font-semibold underline decoration-primary-default decoration-2 ${seen ? 'bg-primary-subtle' : ''}`
                  : `underline decoration-text-tertiary decoration-dashed decoration-1 ${seen ? 'bg-background-subtle' : ''}`
              } ${active ? 'ring-2 ring-border-focus' : ''}`}
            >
              {segment.text}
            </span>
          )
        })}
      </p>

      {open && openHint && openSegment && position ? (
        <HintPopover
          hint={openHint}
          span={openSegment.text}
          exercise={exercise}
          style={{ top: position.top, left: position.left }}
          explicit={open.via === 'explicit'}
          onClose={() => close(true)}
        />
      ) : null}
    </div>
  )
}

function HintPopover({
  hint,
  span,
  exercise,
  style,
  explicit,
  onClose,
}: {
  hint: PracticeHint
  span: string
  exercise: PracticeExercise
  style: React.CSSProperties
  explicit: boolean
  onClose: () => void
}) {
  const required = hint.role === 'required'
  return (
    <div
      role="dialog"
      aria-label={`Hint for ${span}`}
      style={{ ...style, width: 'min(18rem, 100%)' }}
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.stopPropagation()
          onClose()
        }
      }}
      className="absolute z-30 rounded-xl border border-border-strong bg-background-elevated p-3 text-left shadow-lg"
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${
            required ? 'border-primary-default text-primary-default' : 'border-dashed border-border-strong text-text-secondary'
          }`}
        >
          {required ? <BookmarkIcon aria-hidden className="h-3 w-3" /> : <LightbulbIcon aria-hidden className="h-3 w-3" />}
          {required ? 'Required word' : hint.kind === 'idiom' ? 'Extra help · whole expression' : hint.kind === 'phrase' ? 'Extra help · phrase' : 'Extra help'}
        </span>
        {explicit ? (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close hint"
            className="-m-1 rounded-full p-1 text-text-secondary hover:bg-background-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            <XIcon aria-hidden className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      <p className="mt-2 break-words text-sm text-text-secondary">
        <span lang={exercise.sourceLanguage} dir={languageDir(exercise.sourceLanguage)} className="font-medium text-text-primary">
          {span}
        </span>
        <span aria-hidden> → </span>
        <span className="sr-only"> in {languageName(exercise.responseLanguage)}: </span>
        <span lang={exercise.responseLanguage} dir={languageDir(exercise.responseLanguage)} className="text-base font-semibold text-text-primary">
          {hint.gloss}
        </span>
      </p>
      {hint.note ? <p className="mt-1 text-xs text-text-secondary">{hint.note}</p> : null}
      <p className="mt-2 text-xs text-text-tertiary">
        {required
          ? 'Use this dictionary word in your answer. Inflected forms are fine.'
          : 'Support only — not required, and not added to your dictionary.'}{' '}
        Hints are free and never lower your score.
      </p>
    </div>
  )
}

