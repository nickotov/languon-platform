import React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { PlayIcon } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { Button } from '../components/Button'
import { usePreferences } from '../contexts/PreferencesContext'
import { useResources } from '../contexts/ResourcesContext'
import { navSections } from '../data/navigation'
import { formatRelative, resourcePath } from '../utils/navigation'

export function Home() {
  const { t, language } = usePreferences()
  const { items } = useResources()
  const navigate = useNavigate()
  const recent = [...items].sort((a, b) => a.minutesAgo - b.minutesAgo).slice(0, 3)
  const due = items.filter((r) => r.kind === 'dictionary' && r.dueCount).sort((a, b) => (b.dueCount ?? 0) - (a.dueCount ?? 0))

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-4 py-8 md:px-8 md:py-12">
        <PageHeader title={t('page.home')} subtitle={t('page.homeSub')} />

        <section aria-labelledby="continue-heading" className="mt-10">
          <h2 id="continue-heading" className="text-sm font-medium text-text-secondary">{t('page.continue')}</h2>
          <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((resource) => {
              const section = navSections.find((s) => s.resources?.kind === resource.kind)
              const Icon = section?.icon
              return (
                <li key={resource.id}>
                  <Link
                    to={resourcePath(resource)}
                    className="flex h-full flex-col gap-3 rounded-xl border border-border-default bg-background-surface p-4 outline-none transition-colors hover:border-border-strong focus-visible:ring-2 focus-visible:ring-border-focus"
                  >
                    <span className="flex items-center gap-2 text-xs text-text-tertiary">
                      {Icon && <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />}
                      {section && t(section.labelKey)}
                    </span>
                    <span className="line-clamp-2 text-sm font-medium text-text-primary">{resource.title}</span>
                    <span className="mt-auto text-xs text-text-tertiary">{formatRelative(resource.minutesAgo, language)}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>

        <section aria-labelledby="due-heading" className="mt-10">
          <h2 id="due-heading" className="text-sm font-medium text-text-secondary">{t('page.dueReview')}</h2>
          <ul className="mt-3 divide-y divide-border-default rounded-xl border border-border-default bg-background-surface">
            {due.map((resource) => (
              <li key={resource.id} className="flex items-center gap-4 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <Link to={resourcePath(resource)} className="block truncate text-sm font-medium text-text-primary hover:underline">
                    {resource.title}
                  </Link>
                  <p className="text-xs text-text-tertiary">
                    {resource.languagePair} · {resource.dueCount} {t('page.cards')}
                  </p>
                </div>
                <Button variant="secondary" size="compact" leadingIcon={<PlayIcon className="h-4 w-4" />} onClick={() => navigate(resourcePath(resource))}>
                  {t('page.practice')}
                </Button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}

