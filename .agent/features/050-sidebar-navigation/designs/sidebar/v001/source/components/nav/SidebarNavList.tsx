import React from 'react'
import { navGroups, navSections } from '../../data/navigation'
import { SidebarSection } from './SidebarSection'
import { usePreferences } from '../../contexts/PreferencesContext'

type SidebarNavListProps = {
  showPlanned: boolean
  touch?: boolean
  onNavigate?: () => void
}

/** Grouped primary navigation for the expanded sidebar and mobile drawer. */
export function SidebarNavList({ showPlanned, touch = false, onNavigate }: SidebarNavListProps) {
  const { t } = usePreferences()

  return (
    <div className="space-y-5">
      {navGroups.map((group) => {
        const sections = navSections.filter(
          (s) => s.group === group.id && (s.status === 'live' || showPlanned)
        )
        if (sections.length === 0) return null
        const headingId = `nav-group-${group.id}`
        return (
          <div key={group.id} role="group" aria-labelledby={group.labelKey ? headingId : undefined}>
            {group.labelKey && (
              <p id={headingId} className="mb-1 px-3 text-xs font-medium text-text-tertiary">
                {t(group.labelKey)}
              </p>
            )}
            <ul role="list" className="space-y-0.5">
              {sections.map((section) => (
                <SidebarSection key={section.id} section={section} touch={touch} onNavigate={onNavigate} />
              ))}
            </ul>
          </div>
        )
      })}
    </div>
  )
}

