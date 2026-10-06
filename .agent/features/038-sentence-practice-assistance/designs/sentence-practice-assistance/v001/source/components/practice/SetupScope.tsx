import React, { useState } from 'react'
import { ChevronDownIcon, ChevronUpIcon, SearchIcon } from 'lucide-react'
import { Button } from '../Button'
import { Input } from '../Input'
import { Radio, RadioGroup } from '../Radio'
import type { Dictionary, VocabCard } from '../../types/dictionary'

export const ROUND_WORD_CAP = 100
const PAGE = 20

interface SetupScopeProps {
  dictionary: Dictionary
  eligible: VocabCard[]
  skipped: VocabCard[]
  scope: 'batch' | 'manual'
  onScopeChange: (scope: 'batch' | 'manual') => void
  selected: string[]
  onSelectedChange: (ids: string[]) => void
  initialQuery?: string
}

/** Dictionary batch (first 100 eligible in stable order) or manual choice, also capped at 100. */
export function SetupScope({ dictionary, eligible, skipped, scope, onScopeChange, selected, onSelectedChange, initialQuery = '' }: SetupScopeProps) {
  const [query, setQuery] = useState(initialQuery)
  const [visible, setVisible] = useState(PAGE)
  const [showSkipped, setShowSkipped] = useState(false)
  const batchSize = Math.min(eligible.length, ROUND_WORD_CAP)
  const atCap = selected.length >= ROUND_WORD_CAP

  const filtered = eligible.filter((entry) => `${entry.source} ${entry.translation}`.toLowerCase().includes(query.trim().toLowerCase()))
  const rows = filtered.slice(0, visible)

  const toggle = (id: string) => {
    if (selected.includes(id)) onSelectedChange(selected.filter((item) => item !== id))
    else if (!atCap) onSelectedChange([...selected, id])
  }

  return (
    <div className="space-y-3">
      <RadioGroup size="sm" label="Words for this round" value={scope} onChange={(value) => onScopeChange(value as 'batch' | 'manual')}>
        <Radio
          value="batch"
          description={
            eligible.length > ROUND_WORD_CAP
              ? `Uses the first ${ROUND_WORD_CAP} eligible words in dictionary order (of ${eligible.length}). Choose entries to practise others.`
              : `Uses all ${eligible.length} eligible words, in dictionary order.`
          }
        >
          Dictionary batch ({batchSize} {batchSize === 1 ? 'word' : 'words'})
        </Radio>
        <Radio value="manual" description={`Pick up to ${ROUND_WORD_CAP} words.`}>
          Choose entries
        </Radio>
      </RadioGroup>

      {skipped.length > 0 ? (
        <div className="text-xs text-text-secondary">
          <button
            type="button"
            aria-expanded={showSkipped}
            onClick={() => setShowSkipped((prev) => !prev)}
            className="inline-flex items-center gap-1 rounded-sm underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            {skipped.length} incomplete {skipped.length === 1 ? 'entry is' : 'entries are'} left out — {skipped.length === 1 ? 'it needs' : 'they need'} a translation
            {showSkipped ? <ChevronUpIcon aria-hidden className="h-3.5 w-3.5" /> : <ChevronDownIcon aria-hidden className="h-3.5 w-3.5" />}
          </button>
          {showSkipped ? (
            <ul className="mt-1 list-disc ps-5">
              {skipped.map((entry) => (
                <li key={entry.id} lang={dictionary.sourceLanguage}>{entry.source}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {scope === 'manual' ? (
        <div className="space-y-2 rounded-xl border border-border-default p-3">
          <Input
            type="search"
            size="sm"
            aria-label="Search vocabulary"
            placeholder="Search vocabulary"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setVisible(PAGE)
            }}
            leadingIcon={<SearchIcon aria-hidden className="h-4 w-4" />}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium text-text-primary" aria-live="polite">
              {selected.length} of {ROUND_WORD_CAP} max selected
            </p>
            <div className="flex gap-2">
              <Button
                size="compact"
                variant="secondary"
                disabled={atCap}
                onClick={() => onSelectedChange(Array.from(new Set([...selected, ...rows.map((entry) => entry.id)])).slice(0, ROUND_WORD_CAP))}
              >
                Select shown
              </Button>
              <Button size="compact" variant="secondary" onClick={() => onSelectedChange([])} disabled={!selected.length}>
                Clear
              </Button>
            </div>
          </div>
          {atCap ? <p className="text-xs text-text-secondary">You’ve reached the {ROUND_WORD_CAP}-word limit for one round. Clear some words to choose others.</p> : null}
          <ul className="max-h-60 space-y-0.5 overflow-y-auto" aria-label="Eligible vocabulary">
            {rows.map((entry) => {
              const checked = selected.includes(entry.id)
              return (
                <li key={entry.id}>
                  <label className={`flex min-h-11 items-center gap-3 rounded-lg px-2 py-1.5 ${!checked && atCap ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-background-subtle'}`}>
                    <input type="checkbox" checked={checked} disabled={!checked && atCap} onChange={() => toggle(entry.id)} className="h-4 w-4 accent-primary-default" />
                    <span className="min-w-0 flex-1 break-words text-sm">
                      <span lang={dictionary.sourceLanguage} className="font-medium text-text-primary">{entry.source}</span>
                      <span className="text-text-tertiary"> — </span>
                      <span lang={dictionary.targetLanguage} className="text-text-secondary">{entry.translation}</span>
                    </span>
                  </label>
                </li>
              )
            })}
            {filtered.length === 0 ? <li className="px-2 py-3 text-sm text-text-secondary">No vocabulary matches “{query}”.</li> : null}
          </ul>
          {filtered.length > visible ? (
            <Button size="compact" variant="secondary" fullWidth onClick={() => setVisible((prev) => prev + PAGE)}>
              Load more ({filtered.length - visible} more)
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

