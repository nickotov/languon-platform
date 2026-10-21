import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { PinIcon, PlusIcon } from 'lucide-react'
import { PageHeader } from '../components/PageHeader'
import { Button } from '../components/Button'
import { Badge } from '../components/Badge'
import { usePreferences } from '../contexts/PreferencesContext'
import { useResources } from '../contexts/ResourcesContext'
import { useShell } from '../contexts/ShellContext'
import { navSections } from '../data/navigation'
import { formatRelative, resourcePath } from '../utils/navigation'

export function Collection({ sectionId }: { sectionId: string }) {
  const { t, language } = usePreferences()
  const { items } = useResources()
  const { openCreate } = useShell()
  const [folder, setFolder] = useState<string | null>(null)
  const section = navSections.find((s) => s.id === sectionId)
  const config = section?.resources
  if (!section || !config) return null

  const all = items.filter((r) => r.kind === config.kind).sort((a, b) => a.minutesAgo - b.minutesAgo)
  const folders = Array.from(new Set(all.map((r) => r.folder).filter((f): f is string => Boolean(f))))
  const list = folder ? all.filter((r) => r.folder === folder) : all

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-5xl px-4 py-8 md:px-8 md:py-12">
        <PageHeader
          title={t(section.labelKey)}
          subtitle={`${all.length} ${t('label.items')}`}
          actions={
            <Button leadingIcon={<PlusIcon className="h-4 w-4" />} onClick={() => openCreate(config.kind)}>
              {t(config.createLabelKey)}
            </Button>
          }
        />

        {folders.length > 0 && (
          <div role="radiogroup" aria-label="Folders" className="mt-6 flex flex-wrap gap-2">
            {[null, ...folders].map((f) => (
              <button
                key={f ?? 'all'}
                type="button"
                role="radio"
                aria-checked={folder === f}
                onClick={() => setFolder(f)}
                className={`h-8 rounded-lg border px-3 text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-border-focus ${
                  folder === f
                    ? 'border-primary-default bg-primary-subtle text-primary-default'
                    : 'border-border-default bg-background-surface text-text-secondary hover:text-text-primary'
                }`}
              >
                {f ?? t('page.allFolders')}
              </button>
            ))}
          </div>
        )}

        {list.length === 0 ? (
          <div className="mt-8 rounded-xl border border-dashed border-border-strong px-6 py-12 text-center">
            <p className="text-sm text-text-secondary">{t(config.emptyLabelKey)}</p>
          </div>
        ) : (
          <ul className="mt-6 divide-y divide-border-default rounded-xl border border-border-default bg-background-surface">
            {list.map((resource) => (
              <li key={resource.id}>
                <Link
                  to={resourcePath(resource)}
                  className="flex items-center gap-4 px-4 py-3 outline-none transition-colors hover:bg-background-subtle focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus"
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <span className="truncate text-sm font-medium text-text-primary">{resource.title}</span>
                    {resource.pinned && <PinIcon className="h-3.5 w-3.5 shrink-0 text-text-tertiary" aria-label="Pinned" />}
                  </span>
                  {resource.languagePair && <Badge size="sm">{resource.languagePair}</Badge>}
                  {resource.folder && <span className="hidden text-xs text-text-tertiary sm:inline">{resource.folder}</span>}
                  {resource.count !== undefined && (
                    <span className="hidden w-24 text-right text-xs tabular-nums text-text-tertiary sm:inline">
                      {resource.count} {t('page.cards')}
                    </span>
                  )}
                  <span className="hidden w-32 text-right text-xs text-text-tertiary md:inline">{formatRelative(resource.minutesAgo, language)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

