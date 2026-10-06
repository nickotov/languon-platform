import React from 'react'
import { LockIcon } from 'lucide-react'
import { Textarea } from '../Textarea'
import type { LanguageCode } from '../../types/dictionary'
import { languageName } from '../../data/languages'
import { MAX_ANSWER_CODE_POINTS, codePointLength } from '../../utils/codePoints'

interface DraftFieldProps {
  value: string
  onChange: (value: string) => void
  answerLanguage: LanguageCode
  error: string | null
  /** Read-only while the exact submitted text is being checked. */
  locked: boolean
}

export function DraftField({ value, onChange, answerLanguage, error, locked }: DraftFieldProps) {
  const length = codePointLength(value)
  const nearLimit = length > MAX_ANSWER_CODE_POINTS * 0.85
  const over = length > MAX_ANSWER_CODE_POINTS

  return (
    <div className="space-y-1">
      <Textarea
        id="practice-draft"
        label={`Your translation in ${languageName(answerLanguage)}`}
        description={locked ? undefined : `Write the whole sentence in ${languageName(answerLanguage)}. Your exact text is kept.`}
        error={error ?? undefined}
        value={value}
        readOnly={locked}
        aria-readonly={locked}
        dir="auto"
        lang={answerLanguage}
        rows={3}
        onChange={(event) => onChange(event.target.value)}
        onFocus={(event) => {
          const target = event.currentTarget
          window.setTimeout(() => target.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 250)
        }}
        className={`text-base ${locked ? 'bg-background-subtle' : ''}`}
        wrapperClassName="w-full"
      />
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
        {locked ? (
          <span className="inline-flex items-center gap-1 text-text-secondary" role="status">
            <LockIcon aria-hidden className="h-3.5 w-3.5" />
            Checking this exact answer — editing resumes when the check ends.
          </span>
        ) : (
          <span />
        )}
        {nearLimit ? (
          <span aria-live="polite" className={over ? 'font-semibold text-danger-default' : 'text-text-secondary'}>
            {length.toLocaleString()} / {MAX_ANSWER_CODE_POINTS.toLocaleString()} characters{over ? ' — over the limit' : ''}
          </span>
        ) : null}
      </div>
    </div>
  )
}

