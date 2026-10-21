import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { PlusIcon, SearchIcon } from 'lucide-react'
import { ResourceList } from './ResourceList'
import { usePreferences } from '../../contexts/PreferencesContext'
import { useShell } from '../../contexts/ShellContext'
import type { NavSection } from '../../types/navigation'

type ResourcePanelProps = {
  section: NavSection
  /** flyout: temporary panel from the rail. docked: persistent resource browser (Concept B). */
  variant: 'flyout' | 'docked'
  onNavigate?: () => void
  headerAction?: React.ReactNode
}

/** Shared section panel used by collapsed-rail flyouts and the docked resource browser. */
export function ResourcePanel({ section, variant, onNavigate, headerAction }: ResourcePanelProps) {
  const { t } = usePreferences()
  const { openCreate } = useShell()
  const navigate = useNavigate()
  const [filter, setFilter] = useState('')
  const config = section.resources
  const Icon = section.icon
  const label = t(section.labelKey)

  return (
    <div className={`flex flex-col ${variant === 'docked' ? 'h-full' : ''}`} aria-label={label} role="group">
      <div className={`flex items-center gap-2 px-3 ${variant === 'docked' ? 'h-14 border-b border-border-default' : 'pb-2 pt-3'}`}>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary-subtle text-primary-default">
          <Icon className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
        </span>
        <a
          href={section.path}
          onClick={(event) => {
            event.preventDefault()
            navigate(section.path)
            onNavigate?.()
          }}
          className="min-w-0 flex-1 truncate rounded-md text-sm font-semibold text-text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-border-focus"
        >
          {label}
        </a>
        {config && (
          <button
            type="button"
            onClick={() => {
              onNavigate?.()
              openCreate(config.kind)
            }}
            className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-medium text-text-secondary outline-none transition-colors hover:bg-background-subtle hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            <PlusIcon className="h-3.5 w-3.5" aria-hidden="true" />
            {t('action.create')}
          </button>
        )}
        {headerAction}
      </div>

      {config && (
        <>
          <div className={`px-3 ${variant === 'docked' ? 'pt-3' : ''}`}>
            <label className="flex h-9 items-center gap-2 rounded-lg border border-border-default bg-background-subtle px-2.5 focus-within:ring-2 focus-within:ring-border-focus">
              <SearchIcon className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />
              <span className="sr-only">{t('action.filter')}</span>
              <input
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder={t('action.filter')}
                className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-tertiary"
              />
            </label>
          </div>
          <div className={`px-1.5 pb-1.5 pt-1 ${variant === 'docked' ? 'min-h-0 flex-1 overflow-y-auto' : ''}`}>
            <ResourceList section={section} variant="panel" enabled filter={filter} onNavigate={onNavigate} />
          </div>
        </>
      )}
    </div>
  )
}

