import React from 'react'
import { Link, useParams } from 'react-router-dom'
import { ChevronRightIcon, PlayIcon } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { usePreferences } from '../contexts/PreferencesContext'
import { useResources } from '../contexts/ResourcesContext'
import { vocabularySample } from '../data/resources'
import { NotFound } from './NotFound'

export function Dictionary() {
  const { id } = useParams()
  const { t } = usePreferences()
  const { items } = useResources()
  const dictionary = items.find((r) => r.kind === 'dictionary' && r.id === id)
  if (!dictionary) return <NotFound />

  const terms = dictionary.count === 0 ? [] : vocabularySample

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-4 py-8 md:px-8 md:py-12">
        <nav aria-label="Breadcrumb" className="mb-4 flex items-center gap-1 text-sm text-text-tertiary">
          <Link to="/dictionaries" className="hover:text-text-primary">{t('nav.dictionaries')}</Link>
          <ChevronRightIcon className="h-3.5 w-3.5" aria-hidden="true" />
          <span aria-current="page" className="truncate text-text-secondary">{dictionary.title}</span>
        </nav>
        <PageHeader
          title={dictionary.title}
          subtitle={
            <span className="flex items-center gap-2">
              <Badge size="sm">{dictionary.languagePair}</Badge>
              <span>{dictionary.count ?? 0} {t('page.cards')}</span>
            </span>
          }
          actions={<Button leadingIcon={<PlayIcon className="h-4 w-4" />} disabled={terms.length === 0}>{t('page.practice')}</Button>}
        />
        {terms.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-border-strong px-6 py-12 text-center text-sm text-text-secondary">
            {t('state.emptyDictionaries')}
          </div>
        ) : (
          <ul className="mt-8 grid gap-3 md:grid-cols-2">
            {terms.map((term) => (
              <li key={term.term} className="rounded-xl border border-border-default bg-background-surface p-4">
                <p className="text-base font-semibold text-vocabulary-term">{term.term}</p>
                <p className="mt-0.5 text-sm text-text-secondary">{term.translation}</p>
                <p className="mt-3 text-sm italic text-text-tertiary">{term.example}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

