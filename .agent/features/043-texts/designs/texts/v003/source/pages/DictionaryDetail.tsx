import React from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArrowRightIcon, BookMarkedIcon, FileTextIcon } from 'lucide-react'
import { Badge } from '../components/Badge'
import { Breadcrumb } from '../components/Breadcrumb'
import { Button } from '../components/Button'
import { EmptyState } from '../components/ui/EmptyState'
import { useTextsStore } from '../contexts/TextsStore'
import { languageName } from '../utils/languages'

export function DictionaryDetail() {
  const { dictionaryId = '' } = useParams()
  const navigate = useNavigate()
  const { dictionaries, cards } = useTextsStore()
  const dict = dictionaries.find((d) => d.id === dictionaryId)

  if (!dict) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <EmptyState
          icon={<BookMarkedIcon className="h-6 w-6" />}
          title="Dictionary not found"
          description="It may have been removed."
          action={<Button onClick={() => navigate('/texts')}>Back to Texts</Button>}
        />
      </div>
    )
  }

  const list = cards.filter((c) => c.dictionaryId === dict.id)
  const hidesDefinition = dict.hiddenFields.includes('definition')
  const hidesExample = dict.hiddenFields.includes('example')

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 lg:px-12 lg:py-10">
      <Breadcrumb items={[{ label: 'Dictionaries' }, { label: dict.name }]} />
      <header className="mt-4">
        <h1 className="break-words text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">{dict.name}</h1>
        <p className="mt-2 inline-flex items-center gap-1 text-sm text-text-secondary">
          {languageName(dict.sourceLang)} <ArrowRightIcon className="h-4 w-4" aria-label="to" /> {languageName(dict.targetLang)} · {list.length}{' '}
          {list.length === 1 ? 'card' : 'cards'}
        </p>
        {dict.hiddenFields.length > 0 && (
          <p className="mt-2 text-xs text-text-tertiary">
            Display setting: this dictionary hides {[hidesDefinition && 'definitions', hidesExample && 'examples'].filter(Boolean).join(' and ')}.
          </p>
        )}
      </header>

      <ul className="mt-8 space-y-3">
        {list.map((c) => {
          const isNew = Date.now() - new Date(c.createdAt).getTime() < 1000 * 60 * 30
          return (
            <li key={c.id} className="rounded-2xl border border-border-default bg-background-surface p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <p className="break-words text-lg font-semibold text-vocabulary-term" lang={dict.sourceLang}>
                  {c.term}
                </p>
                <div className="flex flex-wrap gap-2">
                  {isNew && <Badge tone="success" size="sm" withDot>New</Badge>}
                  {c.fromText && <Badge tone="neutral" size="sm" icon={<FileTextIcon />}>From a text</Badge>}
                </div>
              </div>
              <p className="mt-1 break-words text-base text-text-primary" lang={dict.targetLang}>
                {c.translation}
              </p>
              {(!hidesDefinition || c.fromText) && <p className="mt-3 break-words text-sm leading-6 text-text-secondary">{c.definition}</p>}
              {(!hidesExample || c.fromText) && (
                <div className="mt-3 border-l-2 border-border-strong pl-3 text-sm leading-6">
                  <p className="break-words text-text-primary" lang={dict.sourceLang}>{c.example}</p>
                  <p className="break-words text-text-secondary" lang={dict.targetLang}>{c.exampleTranslation}</p>
                </div>
              )}
              {c.fromText && dict.hiddenFields.length > 0 && (
                <p className="mt-3 text-xs text-text-tertiary">This card includes every field; the dictionary’s display settings are unchanged.</p>
              )}
              {c.context && (
                <p className="mt-3 break-words text-xs text-text-tertiary">
                  Context: <span className="italic">{c.context}</span>
                </p>
              )}
            </li>
          )
        })}
        {list.length === 0 && (
          <EmptyState icon={<BookMarkedIcon className="h-6 w-6" />} title="No cards yet" description="Select a word in any text to add it here." />
        )}
      </ul>
    </div>
  )
}
