import React from 'react'
import { Textarea } from '../Textarea'
import type { LanguageCode } from '../../types/dictionary'
import { languageDir, languageName } from '../../data/languages'
import { MAX_ANSWER_LENGTH } from '../../hooks/usePracticeSession'

interface DraftFieldProps {
  value: string
  onChange: (value: string) => void
  responseLanguage: LanguageCode
  error?: string | null
  /** While a check is pending the submitted text is shown read-only. */
  locked?: boolean
}

export function DraftField({
  value,
  onChange,
  responseLanguage,
  error,
  locked = false,
}: DraftFieldProps) {
  const over = value.length - MAX_ANSWER_LENGTH
  const nearLimit = value.length > MAX_ANSWER_LENGTH * 0.85

  return (
    <div>
      <Textarea
        label={`Your translation (${languageName(responseLanguage)})`}
        description={
          locked
            ? 'Locked while the AI checks this exact text. Your draft is kept.'
            : 'Translate the whole sentence in your own words.'
        }
        rows={3}
        resize="vertical"
        value={value}
        readOnly={locked}
        aria-readonly={locked || undefined}
        dir={languageDir(responseLanguage)}
        lang={responseLanguage}
        error={error ?? undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {nearLimit || over > 0 ? (
        <p
          aria-live="polite"
          className={`mt-1 text-end text-xs ${over > 0 ? 'font-medium text-danger-default' : 'text-text-tertiary'}`}
        >
          {over > 0
            ? `${value.length} / ${MAX_ANSWER_LENGTH} — ${over} over the limit`
            : `${value.length} / ${MAX_ANSWER_LENGTH}`}
        </p>
      ) : null}
    </div>
  )
}

