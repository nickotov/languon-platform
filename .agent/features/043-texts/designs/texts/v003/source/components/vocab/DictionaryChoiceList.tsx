import React, { useState } from 'react'
import { BookMarkedIcon, CheckIcon, SearchIcon } from 'lucide-react'
import { Input } from '../Input'
import { useTextsStore } from '../../contexts/TextsStore'
import type { Dictionary } from '../../types/texts'

interface DictionaryChoiceListProps {
  dictionaries: Dictionary[]
  value: string | null
  onChange: (id: string) => void
  isBusy: (id: string) => boolean
}

export function DictionaryChoiceList({ dictionaries, value, onChange, isBusy }: DictionaryChoiceListProps) {
  const { cards } = useTextsStore()
  const [query, setQuery] = useState('')
  const filtered = dictionaries.filter((d) => d.name.toLowerCase().includes(query.trim().toLowerCase()))

  return (
    <div className="space-y-2">
      {dictionaries.length > 5 && (
        <Input
          size="sm"
          type="search"
          aria-label="Filter dictionaries"
          placeholder="Filter dictionaries"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          leadingIcon={<SearchIcon className="h-4 w-4" />}
        />
      )}
      <div role="radiogroup" aria-label="Dictionaries" className="max-h-56 space-y-1 overflow-y-auto pr-1">
        {filtered.map((d) => {
          const checked = value === d.id
          const count = cards.filter((c) => c.dictionaryId === d.id).length
          const busy = isBusy(d.id)
          return (
            <label
              key={d.id}
              className={`flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border px-3 py-2 transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-border-focus ${
                checked ? 'border-primary-default bg-primary-subtle' : 'border-border-default hover:bg-background-subtle'
              }`}
            >
              <input
                type="radio"
                name="dictionary"
                value={d.id}
                checked={checked}
                onChange={() => onChange(d.id)}
                className="sr-only"
              />
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
                  checked ? 'border-primary-default bg-primary-default text-background-surface' : 'border-border-strong'
                }`}
                aria-hidden
              >
                {checked && <CheckIcon className="h-3 w-3" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block break-words text-sm font-medium leading-5 text-text-primary">{d.name}</span>
                <span className="block text-xs text-text-tertiary">
                  {busy ? 'Adding this word…' : `${count} ${count === 1 ? 'card' : 'cards'}`}
                </span>
              </span>
              <BookMarkedIcon className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" aria-hidden />
            </label>
          )
        })}
        {filtered.length === 0 && <p className="px-1 py-3 text-sm text-text-secondary">No dictionaries match “{query}”.</p>}
      </div>
    </div>
  )
}
