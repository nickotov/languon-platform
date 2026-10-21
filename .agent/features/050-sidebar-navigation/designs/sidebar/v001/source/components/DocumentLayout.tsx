import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRightIcon, SparklesIcon } from 'lucide-react'
import { Button } from './Button'
import { AiChatPanel } from './AiChatPanel'
import { usePreferences } from '../contexts/PreferencesContext'
import { useLayoutMode } from '../hooks/useLayoutMode'
import type { NavSection } from '../types/navigation'

type DocumentLayoutProps = {
  section: NavSection
  title: string
  status?: React.ReactNode
  children: React.ReactNode
}

/** Editor/reader page frame: breadcrumb bar, scrollable reading column, contextual AI panel. */
export function DocumentLayout({ section, title, status, children }: DocumentLayoutProps) {
  const { t, aiPanelOpen, setAiPanelOpen } = usePreferences()
  const { mode } = useLayoutMode()
  const docked = mode === 'desktop'
  // On tablet/mobile the assistant is an on-demand sheet so the editor stays primary.
  const [sheetOpen, setSheetOpen] = useState(false)
  const panelOpen = docked ? aiPanelOpen : sheetOpen
  const setPanelOpen = docked ? setAiPanelOpen : setSheetOpen

  return (
    <div className="flex min-h-0 flex-1">
      <div className="flex min-w-0 flex-1 flex-col bg-background-surface">
        <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border-default px-4">
          <nav aria-label="Breadcrumb" className="flex min-w-0 flex-1 items-center gap-1 text-sm">
            <Link to={section.path} className="shrink-0 rounded-md px-1 text-text-tertiary outline-none hover:text-text-primary focus-visible:ring-2 focus-visible:ring-border-focus">
              {t(section.labelKey)}
            </Link>
            <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
            <span aria-current="page" className="min-w-0 truncate font-medium text-text-primary">{title}</span>
          </nav>
          {status}
          {!panelOpen && (
            <Button variant="ghost" size="compact" leadingIcon={<SparklesIcon className="h-4 w-4" />} onClick={() => setPanelOpen(true)} aria-label={t('ai.open')}>
              <span className="hidden sm:inline">{t('ai.title')}</span>
            </Button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-reading px-4 py-8 md:px-6 md:py-12">{children}</div>
        </div>
      </div>
      <AiChatPanel open={panelOpen} onClose={() => setPanelOpen(false)} variant={docked ? 'docked' : 'sheet'} />
    </div>
  )
}

