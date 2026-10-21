import React, { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { PanelLeftCloseIcon, PanelLeftOpenIcon } from 'lucide-react'
import { IconButton } from '../IconButton'
import { ResourcePanel } from './ResourcePanel'
import { usePreferences } from '../../contexts/PreferencesContext'
import { navSections } from '../../data/navigation'
import { isSectionActive } from '../../utils/navigation'

/**
 * Concept B: a docked resource browser beside the rail, driven by the active
 * section. Shown for comparison — it costs a second persistent column.
 */
export function ResourceBrowser() {
  const { t } = usePreferences()
  const { pathname } = useLocation()
  const [hidden, setHidden] = useState(false)
  const section = navSections.find((s) => s.resources && s.status === 'live' && isSectionActive(s, pathname))

  if (!section) return null

  if (hidden) {
    return (
      <div className="flex h-full w-10 shrink-0 justify-center border-r border-border-default bg-background-surface pt-3">
        <IconButton
          variant="ghost"
          size="sm"
          icon={<PanelLeftOpenIcon />}
          label={`${t('action.showRecent')}: ${t(section.labelKey)}`}
          tooltipPlacement="right"
          onClick={() => setHidden(false)}
        />
      </div>
    )
  }

  return (
    <aside aria-label={t(section.labelKey)} className="h-full w-64 shrink-0 border-r border-border-default bg-background-surface">
      <ResourcePanel
        key={section.id}
        section={section}
        variant="docked"
        headerAction={
          <IconButton
            variant="ghost"
            size="sm"
            icon={<PanelLeftCloseIcon />}
            label={t('action.hideRecent')}
            tooltipPlacement="bottom"
            onClick={() => setHidden(true)}
          />
        }
      />
    </aside>
  )
}

