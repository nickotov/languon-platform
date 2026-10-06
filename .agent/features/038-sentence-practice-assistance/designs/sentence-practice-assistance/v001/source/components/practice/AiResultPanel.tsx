import React, { useState } from 'react'
import { CheckCircle2Icon, ChevronDownIcon, ChevronUpIcon, CircleDashedIcon, InfoIcon, MinusCircleIcon, RepeatIcon, XCircleIcon } from 'lucide-react'
import { Badge } from '../Badge'
import { Button } from '../Button'
import type { AiAttempt, CorrectionKind, Rating } from '../../types/practice'
import { ratingLabel, segmentAnswer } from '../../utils/practiceGrading'
import { languageDir, languageName } from '../../data/languages'

const ratingIcon: Record<Rating, React.ReactNode> = {
  perfect: <CheckCircle2Icon aria-hidden className="h-5 w-5" />,
  good: <CheckCircle2Icon aria-hidden className="h-5 w-5" />,
  'not-bad': <CircleDashedIcon aria-hidden className="h-5 w-5" />,
  again: <RepeatIcon aria-hidden className="h-5 w-5" />,
}
const ratingTone: Record<Rating, string> = {
  perfect: 'border-success-default text-success-default',
  good: 'border-success-default text-success-default',
  'not-bad': 'border-warning-default text-warning-default',
  again: 'border-border-strong text-text-secondary',
}
const kindLabel: Record<CorrectionKind, string> = {
  meaning: 'Meaning',
  grammar: 'Grammar',
  spelling: 'Spelling',
  vocabulary: 'Required word',
  punctuation: 'Punctuation',
}

interface AiResultPanelProps {
  attempt: AiAttempt
  defaultExpanded?: boolean
  compact?: boolean
}

/** Scored AI feedback attached to the exact submitted answer. */
export function AiResultPanel({ attempt, defaultExpanded = false, compact = false }: AiResultPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const { result } = attempt
  const segments = segmentAnswer(attempt.submittedAnswer, result.corrections)
  const numberFor = (id: string) => result.corrections.findIndex((c) => c.id === id) + 1
  const dir = languageDir(attempt.responseLanguage)

  return (
    <section aria-label="AI check result" className="rounded-xl border border-border-default bg-background-surface p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className={`inline-flex items-center gap-2 rounded-xl border-2 px-3 py-1.5 ${ratingTone[result.rating]}`}>
          {ratingIcon[result.rating]}
          <span className="text-xl font-semibold tabular-nums">{result.score}%</span>
        </div>
        <div className="min-w-0">
          <p className="text-base font-semibold text-text-primary" lang={result.explanationLanguage}>
            {ratingLabel(result.rating, result.explanationLanguage)}
          </p>
          <p className="text-xs text-text-tertiary">AI check · feedback in {languageName(result.explanationLanguage)}</p>
        </div>
        {attempt.assisted ? (
          <Badge size="sm" tone="neutral" icon={<InfoIcon aria-hidden className="h-3.5 w-3.5" />}>
            Reference viewed first · grade unchanged
          </Badge>
        ) : null}
      </div>

      <p className="mt-3 text-sm leading-relaxed text-text-primary" lang={result.explanationLanguage}>
        {result.explanation}
      </p>

      <div className="mt-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary">Your submitted answer</p>
        <p dir={dir} lang={attempt.responseLanguage} className="mt-1 whitespace-pre-wrap break-words rounded-lg border border-border-default bg-background-subtle p-3 text-base leading-relaxed text-text-primary">
          {segments.map((segment, index) =>
            segment.correction ? (
              <mark key={index} className="rounded-sm bg-warning-subtle text-text-primary underline decoration-warning-default decoration-wavy decoration-2 underline-offset-4">
                {segment.text}
                <sup className="ms-0.5 text-[10px] font-semibold text-warning-default">
                  {numberFor(segment.correction.id)}
                  <span className="sr-only"> (see correction {numberFor(segment.correction.id)})</span>
                </sup>
              </mark>
            ) : (
              <span key={index}>{segment.text}</span>
            ),
          )}
        </p>
      </div>

      {result.corrections.length > 0 ? (
        <ol className="mt-4 space-y-2" aria-label="Corrections">
          {result.corrections.map((correction, index) => (
            <li key={correction.id} className="flex gap-2 rounded-lg border border-border-default p-2.5 text-sm">
              <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-background-subtle text-xs font-semibold text-text-primary">{index + 1}</span>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <Badge size="sm" tone="neutral">{kindLabel[correction.kind]}</Badge>
                  {correction.original ? (
                    <span dir={dir} lang={attempt.responseLanguage} className="break-words text-text-primary">
                      <span className="line-through decoration-text-tertiary">{correction.original}</span>
                      {correction.suggestion ? <> → <span className="font-medium">{correction.suggestion}</span></> : null}
                    </span>
                  ) : (
                    <span className="text-xs text-text-tertiary">Applies to the whole answer</span>
                  )}
                </p>
                <p className="mt-1 text-text-secondary" lang={result.explanationLanguage}>{correction.note}</p>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="mt-4 text-sm text-text-secondary">No corrections — nothing to change.</p>
      )}

      <div className="mt-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary">Required dictionary words</p>
        <ul className="mt-1 flex flex-wrap gap-2">
          {result.required.map((item) => (
            <li key={item.hintId} className="inline-flex items-center gap-1.5 rounded-lg border border-border-default px-2 py-1 text-sm">
              {item.status === 'used' ? (
                <CheckCircle2Icon aria-hidden className="h-4 w-4 text-success-default" />
              ) : item.status === 'synonym' ? (
                <MinusCircleIcon aria-hidden className="h-4 w-4 text-warning-default" />
              ) : (
                <XCircleIcon aria-hidden className="h-4 w-4 text-danger-default" />
              )}
              <span lang={attempt.responseLanguage} className="font-medium text-text-primary">{item.gloss}</span>
              <span className="text-text-secondary">
                {item.status === 'used' ? 'used' : item.status === 'synonym' ? `synonym used (“${item.note}”)` : 'missing'}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-1 text-xs text-text-tertiary">Extra-help words are support only and are never required.</p>
      </div>

      {result.improved || result.details.length > 0 ? (
        <div className="mt-4">
          <Button
            size="compact"
            variant="secondary"
            aria-expanded={expanded}
            onClick={() => setExpanded((prev) => !prev)}
            trailingIcon={expanded ? <ChevronUpIcon aria-hidden className="h-4 w-4" /> : <ChevronDownIcon aria-hidden className="h-4 w-4" />}
          >
            {expanded ? 'Hide details' : compact ? 'Details' : 'Improved translation and details'}
          </Button>
          {expanded ? (
            <div className="mt-3 space-y-3">
              {result.improved ? (
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary">Improved translation</p>
                  <p dir={dir} lang={attempt.responseLanguage} className="mt-1 break-words text-base text-text-primary">{result.improved}</p>
                </div>
              ) : null}
              {result.details.length > 0 ? (
                <ul className="list-disc space-y-1 ps-5 text-sm text-text-secondary" lang={result.explanationLanguage}>
                  {result.details.map((detail) => <li key={detail}>{detail}</li>)}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <p className="mt-4 text-xs text-text-tertiary">A grade describes this answer only — it isn’t a measure of mastery.</p>
    </section>
  )
}

