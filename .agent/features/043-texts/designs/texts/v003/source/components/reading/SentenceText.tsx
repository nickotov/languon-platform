import React from 'react'
import type { TextMark } from '../../types/texts'

/** Renders a sentence, wrapping the exact selected/adding occurrences in <mark>. */
export function SentenceText({ text, marks }: { text: string; marks: TextMark[] }) {
  if (!marks.length) return <>{text}</>
  const sorted = [...marks].sort((a, b) => a.start - b.start)
  const parts: React.ReactNode[] = []
  let cursor = 0
  sorted.forEach((m, i) => {
    if (m.start < cursor || m.end > text.length) return
    parts.push(text.slice(cursor, m.start))
    parts.push(
      <mark
        key={i}
        data-mark-active={m.state === 'selected' ? 'true' : undefined}
        className={
          m.state === 'selected'
            ? 'rounded-sm bg-selection text-text-primary underline decoration-primary-default decoration-2 underline-offset-4'
            : 'rounded-sm bg-background-subtle text-text-primary underline decoration-text-tertiary decoration-dashed decoration-2 underline-offset-4'
        }
      >
        {text.slice(m.start, m.end)}
        {m.state === 'adding' && <span className="sr-only"> (adding to dictionary)</span>}
      </mark>,
    )
    cursor = m.end
  })
  parts.push(text.slice(cursor))
  return <>{parts}</>
}
