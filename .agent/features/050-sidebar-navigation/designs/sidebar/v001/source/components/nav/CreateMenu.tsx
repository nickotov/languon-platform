import React from 'react'
import { PlusIcon } from 'lucide-react'
import { DropdownMenu, DropdownMenuItem, DropdownMenuLabel, DropdownMenuTrigger } from '../DropdownMenu'
import { Tooltip } from '../Tooltip'
import { usePreferences } from '../../contexts/PreferencesContext'
import { useShell } from '../../contexts/ShellContext'
import { navSections } from '../../data/navigation'

/** Universal create menu — lists only creatable, live sections from the nav config. */
export function CreateMenu({ variant }: { variant: 'square' | 'rail' | 'touch' }) {
  const { t } = usePreferences()
  const { openCreate } = useShell()
  const creatable = navSections.filter((s) => s.status === 'live' && s.resources)

  const size = variant === 'touch' ? 'h-11 w-11' : variant === 'rail' ? 'h-10 w-10' : 'h-9 w-9'

  return (
    <DropdownMenu
      align="start"
      menuClassName="w-56"
      trigger={
        <DropdownMenuTrigger
          hideChevron
          aria-label={t('action.createNew')}
          className={`${size} flex shrink-0 items-center justify-center rounded-lg border border-border-default bg-background-surface text-text-secondary outline-none transition-colors hover:border-border-strong hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus`}
        >
          <Tooltip content={t('action.createNew')} placement={variant === 'rail' ? 'right' : 'bottom'}>
            <span className="flex h-full w-full items-center justify-center">
              <PlusIcon className="h-4 w-4" aria-hidden="true" />
            </span>
          </Tooltip>
        </DropdownMenuTrigger>
      }
    >
      <DropdownMenuLabel>{t('action.create')}</DropdownMenuLabel>
      {creatable.map((section) => {
        const Icon = section.icon
        const config = section.resources
        if (!config) return null
        return (
          <DropdownMenuItem
            key={section.id}
            icon={<Icon className="h-4 w-4" strokeWidth={1.75} />}
            onSelect={() => openCreate(config.kind)}
          >
            {t(config.createLabelKey)}
          </DropdownMenuItem>
        )
      })}
    </DropdownMenu>
  )
}

