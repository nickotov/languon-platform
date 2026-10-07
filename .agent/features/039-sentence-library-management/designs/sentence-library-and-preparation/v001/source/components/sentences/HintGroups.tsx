import React from 'react'
import { ArrowRightIcon, BookOpenIcon, InfoIcon, LightbulbIcon } from 'lucide-react'
import { Badge } from '../Badge'
import { useInterfaceText } from '../../hooks/useInterfaceText'
import type { LibraryHint, SavedSentence } from '../../types/sentenceLibrary'

/** Dictionary words and other useful help, as two equal-weight groups. Phrases stay whole. */
export function HintGroups({ sentence }: { sentence: SavedSentence }) {
  const { L } = useInterfaceText()
  return (
    <div className="grid gap-4">
      <section aria-labelledby={`${sentence.id}-dict`} className="space-y-2">
        <h3 id={`${sentence.id}-dict`} className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <BookOpenIcon aria-hidden className="h-4 w-4 text-text-secondary" />
          {L('dictWords')}
          <span className="text-xs font-normal text-text-tertiary">{sentence.dictionaryHints.length}</span>
        </h3>
        <HintList hints={sentence.dictionaryHints} sentence={sentence} />
      </section>

      <section aria-labelledby={`${sentence.id}-ctx`} className="space-y-2">
        <h3 id={`${sentence.id}-ctx`} className="flex items-center gap-2 text-sm font-semibold text-text-primary">
          <LightbulbIcon aria-hidden className="h-4 w-4 text-text-secondary" />
          {L('otherWords')}
          <span className="text-xs font-normal text-text-tertiary">{sentence.contextHints.length}</span>
        </h3>
        {sentence.contextHints.length ? (
          <HintList hints={sentence.contextHints} sentence={sentence} />
        ) : (
          <p className="flex items-start gap-2 rounded-lg border border-border-default bg-background-subtle p-3 text-sm text-text-secondary">
            <InfoIcon aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
            {L('noExtraHints')}
          </p>
        )}
      </section>
    </div>
  )
}

function HintList({ hints, sentence }: { hints: LibraryHint[]; sentence: SavedSentence }) {
  const { L } = useInterfaceText()
  return (
    <ul className="divide-y divide-border-default overflow-hidden rounded-lg border border-border-default bg-background-surface">
      {hints.map((hint) => (
        <li key={hint.id} className="px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span lang={sentence.sentenceLanguage} dir="auto" className="break-words font-medium text-text-primary [overflow-wrap:anywhere]">
              {hint.source}
            </span>
            <ArrowRightIcon aria-hidden className="h-3.5 w-3.5 shrink-0 text-text-tertiary rtl:rotate-180" />
            <span className="sr-only">→</span>
            <span lang={sentence.answerLanguage} dir="auto" className="break-words text-text-primary [overflow-wrap:anywhere]">
              {hint.target}
            </span>
            {hint.kind === 'phrase' ? (
              <Badge size="sm" tone="neutral">
                {L('expression')}
              </Badge>
            ) : null}
          </div>
          {hint.note ? (
            <p lang={sentence.sentenceLanguage} className="mt-0.5 text-xs text-text-secondary">
              — {hint.note}
            </p>
          ) : null}
        </li>
      ))}
    </ul>
  )
}

