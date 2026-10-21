import React from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { PanelLeftCloseIcon, PanelLeftOpenIcon, SearchIcon } from 'lucide-react'
import { Logo } from '../Logo'
import { IconButton } from '../IconButton'
import { Tooltip } from '../Tooltip'
import { AccountMenu } from './AccountMenu'
import { CreateMenu } from './CreateMenu'
import { RailButton, RailLink } from './RailItem'
import { RailFlyoutItem } from './RailFlyoutItem'
import { SearchTrigger } from './SearchTrigger'
import { SidebarNavList } from './SidebarNavList'
import { usePreferences } from '../../contexts/PreferencesContext'
import { useShell } from '../../contexts/ShellContext'
import { navGroups, navSections } from '../../data/navigation'
import { isSectionActive } from '../../utils/navigation'
import { modKeyLabel } from '../../utils/platform'

type SidebarProps = {
  collapsed: boolean
  onToggle: () => void
  showPlanned: boolean
  /** Concept A uses contextual flyouts; Concept B's rail links straight to sections. */
  flyouts: boolean
}

export function Sidebar({ collapsed, onToggle, showPlanned, flyouts }: SidebarProps) {
  const { t } = usePreferences()

  return (
    <aside
      aria-label={t('nav.label')}
      className={`relative z-20 flex h-full shrink-0 flex-col border-r border-border-default bg-background-subtle transition-all duration-200 ease-out ${
        collapsed ? 'w-16' : 'w-nav-sidebar'
      }`}
    >
      {collapsed ? (
        <CollapsedContent onToggle={onToggle} showPlanned={showPlanned} flyouts={flyouts} />
      ) : (
        <ExpandedContent onToggle={onToggle} showPlanned={showPlanned} />
      )}
    </aside>
  )
}

function ExpandedContent({ onToggle, showPlanned }: { onToggle: () => void; showPlanned: boolean }) {
  const { t } = usePreferences()

  return (
    <>
      <div className="flex h-14 min-w-0 items-center gap-2 pl-4 pr-2">
        <Link to="/" aria-label="Languon home" className="min-w-0 flex-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-border-focus">
          <Logo variant="lockup" size="sm" />
        </Link>
        <IconButton
          variant="ghost"
          size="sm"
          icon={<PanelLeftCloseIcon />}
          label={`${t('action.collapseSidebar')} (${modKeyLabel()} \\)`}
          tooltipPlacement="bottom"
          onClick={onToggle}
        />
      </div>
      <div className="flex min-w-0 items-center gap-1.5 px-3 pb-3">
        <SearchTrigger />
        <CreateMenu variant="square" />
      </div>
      <nav aria-label={t('nav.label')} className="min-h-0 flex-1 overflow-y-auto px-2 pb-4 pt-1">
        <SidebarNavList showPlanned={showPlanned} />
      </nav>
      <div className="border-t border-border-default p-2">
        <AccountMenu variant="expanded" />
      </div>
    </>
  )
}

function CollapsedContent({ onToggle, showPlanned, flyouts }: { onToggle: () => void; showPlanned: boolean; flyouts: boolean }) {
  const { t } = usePreferences()
  const { openPalette } = useShell()
  const { pathname } = useLocation()
  const navigate = useNavigate()

  return (
    <>
      <div className="flex h-14 items-center justify-center">
        <Link to="/" aria-label="Languon home" className="rounded-md outline-none focus-visible:ring-2 focus-visible:ring-border-focus">
          <Logo variant="monogram" size="sm" />
        </Link>
      </div>
      <div className="flex flex-col items-center gap-1 pb-3">
        <Tooltip content={`${t('action.search')} · ${modKeyLabel()} K`} placement="right">
          <RailButton icon={SearchIcon} label={t('action.search')} onClick={openPalette} />
        </Tooltip>
        <CreateMenu variant="rail" />
      </div>
      <nav aria-label={t('nav.label')} className="min-h-0 flex-1 overflow-y-auto overflow-x-visible pb-4 pt-1">
        {navGroups.map((group, index) => {
          const sections = navSections.filter((s) => s.group === group.id && (s.status === 'live' || showPlanned))
          if (sections.length === 0) return null
          return (
            <div key={group.id}>
              {index > 0 && <div aria-hidden="true" className="mx-auto my-2 h-px w-6 bg-border-default" />}
              {group.labelKey && <span className="sr-only">{t(group.labelKey)}</span>}
              <ul role="list" className="flex flex-col items-center gap-1">
                {sections.map((section) => {
                  const label = t(section.labelKey)
                  if (section.status === 'planned') {
                    return (
                      <li key={section.id}>
                        <Tooltip content={`${label} · ${t('label.soon')}`} placement="right">
                          <RailButton icon={section.icon} label={`${label} — ${t('label.soon')}`} aria-disabled="true" className="cursor-not-allowed text-text-disabled hover:bg-transparent hover:text-text-disabled" />
                        </Tooltip>
                      </li>
                    )
                  }
                  if (section.resources && flyouts) return <RailFlyoutItem key={section.id} section={section} />
                  return (
                    <li key={section.id}>
                      <Tooltip content={label} placement="right">
                        <RailLink
                          icon={section.icon}
                          label={label}
                          href={section.path}
                          active={isSectionActive(section, pathname)}
                          onClick={(event) => {
                            if (event.metaKey || event.ctrlKey) return
                            event.preventDefault()
                            navigate(section.path)
                          }}
                        />
                      </Tooltip>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </nav>
      <div className="flex flex-col items-center gap-1 border-t border-border-default py-2">
        <Tooltip content={`${t('action.expandSidebar')} · ${modKeyLabel()} \\`} placement="right">
          <RailButton icon={PanelLeftOpenIcon} label={t('action.expandSidebar')} onClick={onToggle} />
        </Tooltip>
        <AccountMenu variant="collapsed" />
      </div>
    </>
  )
}

