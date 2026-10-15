import React from 'react'
import { ArrowRightIcon, SparklesIcon } from 'lucide-react'
import { languageName } from '../../utils/languages'
import type { LanguageCode, SelectionInfo } from '../../types/texts'

interface ContextPreviewProps {
  selection: SelectionInfo
  from: LanguageCode
  to: LanguageCode
}

const AROUND = 70

export function ContextPreview({ selection, from, to }: ContextPreviewProps) {
  const sentence = selection.sentence ?? ''
  const start = selection.start ?? 0
  const end = selection.end ?? start
  const beforeFull = sentence.slice(0, start)
  const afterFull = sentence.slice(end)
  const before = beforeFull.length > AROUND ? `…${beforeFull.slice(-AROUND)}` : beforeFull
  const after = afterFull.length > AROUND ? `${afterFull.slice(0, AROUND)}…` : afterFull

  return (
    <div className="rounded-xl border border-border-default bg-background-subtle p-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-text-primary">
          {languageName(from)}
          <ArrowRightIcon className="h-3 w-3" aria-label="to" />
          {languageName(to)} card
        </span>
        <span className="inline-flex items-center gap-1 text-xs text-text-tertiary">
          <SparklesIcon className="h-3 w-3" aria-hidden />
          Using sentence context
        </span>
      </div>
      <p lang={from} className="mt-2 break-words text-sm leading-6 text-text-secondary">
        {before}
        <mark className="rounded-sm bg-selection px-0.5 font-medium text-text-primary underline decoration-primary-default decoration-2 underline-offset-2">
          {selection.text}
        </mark>
        {after}
      </p>
    </div>
  )
}
