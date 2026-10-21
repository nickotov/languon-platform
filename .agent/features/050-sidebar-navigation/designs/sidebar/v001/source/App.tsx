import React, { useEffect, useRef } from 'react'
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { PreferencesProvider } from './contexts/PreferencesContext'
import { ResourcesProvider } from './contexts/ResourcesContext'
import { Home } from './pages/Home'
import { Collection } from './pages/Collection'
import { Dictionary } from './pages/Dictionary'
import { TextReader } from './pages/TextReader'
import { KnowledgeDocument } from './pages/KnowledgeDocument'
import { Settings } from './pages/Settings'

type AppProps = {
  concept?: 'contextual-sidebar' | 'rail-browser'
  startPage?: 'home' | 'knowledge-editor' | 'dictionary'
  defaultTheme?: 'dark' | 'light' | 'system'
  defaultLanguage?: 'en' | 'ru'
  startCollapsed?: boolean
  showPlannedSections?: boolean
  resourceState?: 'populated' | 'loading' | 'empty' | 'error'
}

const startPaths: Record<NonNullable<AppProps['startPage']>, string> = {
  home: '/',
  'knowledge-editor': '/knowledge/present-perfect',
  dictionary: '/dictionaries/business-english'
}

export function App({
  concept = 'contextual-sidebar',
  startPage = 'knowledge-editor',
  defaultTheme = 'dark',
  defaultLanguage = 'en',
  startCollapsed = false,
  showPlannedSections = false,
  resourceState = 'populated'
}: AppProps) {
  return (
    <BrowserRouter>
      <PreferencesProvider defaultTheme={defaultTheme} defaultLanguage={defaultLanguage} defaultCollapsed={startCollapsed}>
        <ResourcesProvider previewState={resourceState}>
          <StartRoute path={startPaths[startPage]} />
          <Routes>
            <Route element={<AppShell concept={concept} showPlanned={showPlannedSections} />}>
              <Route index element={<Home />} />
              <Route path="dictionaries" element={<Collection sectionId="dictionaries" />} />
              <Route path="dictionaries/:id" element={<Dictionary />} />
              <Route path="texts" element={<Collection sectionId="texts" />} />
              <Route path="texts/:id" element={<TextReader />} />
              <Route path="knowledge" element={<Collection sectionId="knowledge" />} />
              <Route path="knowledge/:id" element={<KnowledgeDocument />} />
              <Route path="settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </ResourcesProvider>
      </PreferencesProvider>
    </BrowserRouter>
  )
}

/** Prototype helper: jump to the chosen start page when the control changes. */
function StartRoute({ path }: { path: string }) {
  const navigate = useNavigate()
  const last = useRef<string | null>(null)
  useEffect(() => {
    if (last.current === path) return
    last.current = path
    navigate(path, { replace: true })
  }, [path, navigate])
  return null
}

