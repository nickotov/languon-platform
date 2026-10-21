import React from 'react'
import { Link } from 'react-router-dom'
import { MenuIcon, SearchIcon } from 'lucide-react'
import { Logo } from '../Logo'
import { IconButton } from '../IconButton'
import { usePreferences } from '../../contexts/PreferencesContext'
import { useShell } from '../../contexts/ShellContext'

export function MobileHeader() {
  const { t } = usePreferences()
  const { openDrawer, openPalette } = useShell()

  return (
    <header className="flex h-14 shrink-0 items-center gap-1 border-b border-border-default bg-background-surface px-2">
      <IconButton variant="ghost" size="lg" icon={<MenuIcon />} label={t('mobile.openMenu')} showTooltip={false} onClick={openDrawer} />
      <Link to="/" aria-label="Languon home" className="rounded-md px-1 outline-none focus-visible:ring-2 focus-visible:ring-border-focus">
        <Logo size="sm" />
      </Link>
      <div className="flex-1" />
      <IconButton variant="ghost" size="lg" icon={<SearchIcon />} label={t('action.search')} showTooltip={false} onClick={openPalette} />
    </header>
  )
}

