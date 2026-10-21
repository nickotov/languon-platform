import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'
import { Sidebar } from './nav/Sidebar'
import { ResourceBrowser } from './nav/ResourceBrowser'
import { MobileHeader } from './nav/MobileHeader'
import { NavDrawer } from './nav/NavDrawer'
import { CommandPalette } from './nav/CommandPalette'
import { CreateDialog } from './nav/CreateDialog'
import { usePreferences } from '../contexts/PreferencesContext'
import { ShellContext } from '../contexts/ShellContext'
import { useLayoutMode } from '../hooks/useLayoutMode'
import type { ResourceKind } from '../types/navigation'

export type NavigationConcept = 'contextual-sidebar' | 'rail-browser'

type AppShellProps = {
  concept: NavigationConcept
  showPlanned: boolean
}

const EDITOR_ROUTE = /^\/(knowledge|texts)\/[^/]+/

export function AppShell({ concept, showPlanned }: AppShellProps) {
  const { mode, wide } = useLayoutMode()
  const { collapsed, setCollapsed, aiPanelOpen } = usePreferences()
  const { pathname } = useLocation()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [createKind, setCreateKind] = useState<ResourceKind | null>(null)
  const [keepExpanded, setKeepExpanded] = useState(false)

  // Content-space rule: on a laptop-width editor with the AI panel open,
  // the sidebar yields to the rail unless the user explicitly re-expands it.
  const editorNeedsSpace = mode === 'desktop' && !wide && EDITOR_ROUTE.test(pathname) && aiPanelOpen
  const railOnly = mode === 'tablet' || concept === 'rail-browser'
  const effectiveCollapsed = railOnly || collapsed || (editorNeedsSpace && !keepExpanded)

  const toggleSidebar = useCallback(() => {
    if (mode === 'mobile' || mode === 'tablet' || concept === 'rail-browser') {
      setDrawerOpen(true)
      return
    }
    if (effectiveCollapsed) {
      setCollapsed(false)
      setKeepExpanded(true)
    } else {
      setCollapsed(true)
      setKeepExpanded(false)
    }
  }, [mode, concept, effectiveCollapsed, setCollapsed])

  useEffect(() => {
    if (mode === 'desktop') setDrawerOpen(false)
  }, [mode])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey
      if (mod && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen((open) => !open)
      } else if (mod && event.key === '\\') {
        event.preventDefault()
        toggleSidebar()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggleSidebar])

  const shell = useMemo(
    () => ({
      openPalette: () => setPaletteOpen(true),
      openCreate: (kind: ResourceKind) => {
        setDrawerOpen(false)
        setCreateKind(kind)
      },
      openDrawer: () => setDrawerOpen(true),
      closeDrawer: () => setDrawerOpen(false)
    }),
    []
  )

  return (
    <ShellContext.Provider value={shell}>
      <div className="flex h-screen w-full overflow-hidden bg-background-canvas font-sans text-text-primary">
        {mode !== 'mobile' && (
          <Sidebar
            collapsed={effectiveCollapsed}
            onToggle={toggleSidebar}
            showPlanned={showPlanned}
            flyouts={concept === 'contextual-sidebar'}
          />
        )}
        {concept === 'rail-browser' && mode === 'desktop' && <ResourceBrowser />}
        <div className="flex min-w-0 flex-1 flex-col">
          {mode === 'mobile' && <MobileHeader />}
          <main className="flex min-h-0 flex-1 flex-col">
            <Outlet />
          </main>
        </div>
        <NavDrawer open={drawerOpen} onClose={shell.closeDrawer} showPlanned={showPlanned} />
        <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
        <CreateDialog kind={createKind} onClose={() => setCreateKind(null)} />
      </div>
    </ShellContext.Provider>
  )
}

