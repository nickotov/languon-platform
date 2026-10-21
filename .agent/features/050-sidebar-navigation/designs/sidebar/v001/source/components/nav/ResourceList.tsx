import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AlertCircleIcon, ArrowRightIcon, PlusIcon, RotateCwIcon } from 'lucide-react'
import { Skeleton } from '../Skeleton'
import { ResourceRow } from './ResourceRow'
import { usePreferences } from '../../contexts/PreferencesContext'
import { useShell } from '../../contexts/ShellContext'
import { useSectionResources } from '../../hooks/useSectionResources'
import { activeResourceId, quickAccessResources } from '../../utils/navigation'
import type { NavSection } from '../../types/navigation'

type ResourceListProps = {
  section: NavSection
  variant: 'sidebar' | 'drawer' | 'panel'
  enabled: boolean
  filter?: string
  onNavigate?: () => void
}

export function ResourceList({ section, variant, enabled, filter = '', onNavigate }: ResourceListProps) {
  const config = section.resources
  const { t } = usePreferences()
  const { openCreate } = useShell()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { status, items, retry } = useSectionResources(config?.kind ?? 'dictionary', enabled && Boolean(config))

  if (!config) return null

  const inset = variant !== 'panel'
  const touch = variant === 'drawer'
  const activeId = activeResourceId(config.kind, pathname)
  const query = filter.trim().toLowerCase()
  const visible = query
    ? items.filter((r) => r.title.toLowerCase().includes(query)).slice(0, 8)
    : quickAccessResources(items, variant === 'panel' ? config.previewLimit + 1 : config.previewLimit, activeId)

  const messageClass = `flex items-center gap-2 text-sm text-text-tertiary ${inset ? 'pl-10' : 'pl-3'} ${touch ? 'min-h-11' : 'min-h-8'}`

  if (status === 'loading') {
    return (
      <div className={`space-y-2 py-2 pr-3 ${inset ? 'pl-10' : 'pl-3'}`} aria-label={t('state.loading')}>
        <Skeleton width="80%" />
        <Skeleton width="65%" />
        <Skeleton width="72%" />
      </div>
    )
  }

  if (status === 'error') {
    return (
      <div className={`${messageClass} pr-2`} role="alert">
        <AlertCircleIcon className="h-4 w-4 shrink-0 text-danger-default" aria-hidden="true" />
        <span className="min-w-0 flex-1 truncate">{t('state.error')}</span>
        <button
          type="button"
          onClick={retry}
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-primary-default outline-none hover:bg-background-elevated focus-visible:ring-2 focus-visible:ring-border-focus"
        >
          <RotateCwIcon className="h-3 w-3" aria-hidden="true" />
          {t('action.retry')}
        </button>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className={`${messageClass} pr-2`}>
        <span className="min-w-0 flex-1 truncate">{t(config.emptyLabelKey)}</span>
        <button
          type="button"
          onClick={() => openCreate(config.kind)}
          className="inline-flex h-7 shrink-0 items-center gap-1 rounded-md px-2 text-xs font-medium text-primary-default outline-none hover:bg-background-elevated focus-visible:ring-2 focus-visible:ring-border-focus"
        >
          <PlusIcon className="h-3 w-3" aria-hidden="true" />
          {t('action.create')}
        </button>
      </div>
    )
  }

  return (
    <div className="py-1">
      {variant === 'panel' && !query && (
        <p className="px-3 pb-1 pt-1 text-xs font-medium text-text-tertiary">{t('label.recent')}</p>
      )}
      {visible.length === 0 ? (
        <p className={messageClass}>{t('state.noMatches')}</p>
      ) : (
        <ul role="list" className="space-y-0.5">
          {visible.map((resource) => (
            <ResourceRow
              key={resource.id}
              resource={resource}
              active={resource.id === activeId}
              inset={inset}
              touch={touch}
              onNavigate={onNavigate}
            />
          ))}
        </ul>
      )}
      <a
        href={section.path}
        onClick={(event) => {
          event.preventDefault()
          navigate(section.path)
          onNavigate?.()
        }}
        className={`mt-0.5 flex items-center gap-1.5 rounded-lg pr-2 text-xs font-medium text-text-tertiary outline-none transition-colors hover:bg-background-elevated hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus ${
          inset ? 'pl-10' : 'pl-3'
        } ${touch ? 'h-11' : 'h-8'}`}
      >
        <span className="truncate">{t(config.viewAllLabelKey)}</span>
        <span className="tabular-nums">· {items.length}</span>
        <ArrowRightIcon className="ml-auto h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      </a>
    </div>
  )
}

