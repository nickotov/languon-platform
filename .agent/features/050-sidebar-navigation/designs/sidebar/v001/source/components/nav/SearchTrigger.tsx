import React from 'react'
import { SearchIcon } from 'lucide-react'
import { Kbd } from './Kbd'
import { usePreferences } from '../../contexts/PreferencesContext'
import { useShell } from '../../contexts/ShellContext'
import { modKeyLabel } from '../../utils/platform'

export function SearchTrigger({ touch = false }: { touch?: boolean }) {
  const { t } = usePreferences()
  const { openPalette } = useShell()

  return (
    <button
      type="button"
      onClick={openPalette}
      aria-keyshortcuts="Meta+K Control+K"
      className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-border-default bg-background-surface px-2.5 text-sm text-text-tertiary outline-none transition-colors hover:border-border-strong hover:text-text-secondary focus-visible:ring-2 focus-visible:ring-border-focus ${
        touch ? 'h-11' : 'h-9'
      }`}
    >
      <SearchIcon className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 flex-1 truncate text-left">{t('action.search')}</span>
      {!touch && (
        <span className="flex shrink-0 items-center gap-0.5" aria-hidden="true">
          <Kbd>{modKeyLabel()}</Kbd>
          <Kbd>K</Kbd>
        </span>
      )}
    </button>
  )
}

