import React from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ChevronRightIcon, PlusIcon } from 'lucide-react'
import { NavItem } from '../NavItem'
import { Badge } from '../Badge'
import { ResourceList } from './ResourceList'
import { usePreferences } from '../../contexts/PreferencesContext'
import { useShell } from '../../contexts/ShellContext'
import { isSectionActive } from '../../utils/navigation'
import type { NavSection } from '../../types/navigation'

type SidebarSectionProps = {
  section: NavSection
  touch?: boolean
  onNavigate?: () => void
}

/** Expanded-sidebar / drawer row: title navigates, chevron discloses, + creates. */
export function SidebarSection({ section, touch = false, onNavigate }: SidebarSectionProps) {
  const { t, expandedSections, toggleSection } = usePreferences()
  const { openCreate } = useShell()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const reduceMotion = useReducedMotion()
  const label = t(section.labelKey)

  if (section.status === 'planned') {
    return (
      <li>
        <NavItem label={label} icon={section.icon} disabled badge={<Badge size="sm">{t('label.soon')}</Badge>} />
      </li>
    )
  }

  const active = isSectionActive(section, pathname)
  const config = section.resources
  const expanded = Boolean(config && expandedSections[section.id])
  const listId = `nav-${section.id}-resources`
  const actionSize = touch ? 'h-10 w-10' : 'h-7 w-7'

  return (
    <li>
      <div className="group/section relative">
        <NavItem
          label={label}
          icon={section.icon}
          href={section.path}
          active={active}
          className={config ? (touch ? 'pr-24' : 'pr-16') : undefined}
          onClick={(event) => {
            if (event.metaKey || event.ctrlKey) return
            event.preventDefault()
            navigate(section.path)
            onNavigate?.()
          }}
        />
        {config && (
          <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
            <button
              type="button"
              aria-label={t(config.createLabelKey)}
              title={t(config.createLabelKey)}
              onClick={() => {
                onNavigate?.()
                openCreate(config.kind)
              }}
              className={`${actionSize} flex items-center justify-center rounded-md text-text-tertiary outline-none transition-opacity duration-150 hover:bg-background-canvas hover:text-text-primary focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-border-focus ${
                touch ? '' : 'opacity-0 group-focus-within/section:opacity-100 group-hover/section:opacity-100'
              }`}
            >
              <PlusIcon className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              aria-expanded={expanded}
              aria-controls={listId}
              aria-label={`${t(expanded ? 'action.hideRecent' : 'action.showRecent')}: ${label}`}
              onClick={() => toggleSection(section.id)}
              className={`${actionSize} flex items-center justify-center rounded-md text-text-tertiary outline-none hover:bg-background-canvas hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus`}
            >
              <ChevronRightIcon
                className={`h-4 w-4 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`}
                aria-hidden="true"
              />
            </button>
          </div>
        )}
      </div>
      {config && (
        <AnimatePresence initial={false}>
          {expanded && (
            <motion.div
              id={listId}
              key="list"
              initial={reduceMotion ? false : { height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={reduceMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
              className="overflow-hidden"
            >
              <ResourceList section={section} variant={touch ? 'drawer' : 'sidebar'} enabled onNavigate={onNavigate} />
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </li>
  )
}

