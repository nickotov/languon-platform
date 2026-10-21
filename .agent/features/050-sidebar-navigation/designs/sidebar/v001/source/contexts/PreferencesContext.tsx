import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { translations } from '../data/i18n'
import type { Language, TranslationKey } from '../data/i18n'
import type { ThemePreference } from '../types/navigation'
import { interpolate } from '../utils/navigation'

type PreferencesValue = {
  theme: ThemePreference
  setTheme: (theme: ThemePreference) => void
  resolvedTheme: 'light' | 'dark'
  language: Language
  setLanguage: (language: Language) => void
  t: (key: TranslationKey, vars?: Record<string, string | number>) => string
  /** Desktop sidebar preference (persisted). */
  collapsed: boolean
  setCollapsed: (collapsed: boolean) => void
  /** Which resource sections are disclosed in the expanded sidebar (persisted). */
  expandedSections: Record<string, boolean>
  toggleSection: (id: string) => void
  aiPanelOpen: boolean
  setAiPanelOpen: (open: boolean) => void
}

type PreferencesProviderProps = {
  children: React.ReactNode
  defaultTheme: ThemePreference
  defaultLanguage: Language
  defaultCollapsed: boolean
}

type StoredPreferences = {
  collapsed?: boolean
  expandedSections?: Record<string, boolean>
  aiPanelOpen?: boolean
}

const STORAGE_KEY = 'languon.navigation.v1'
const PreferencesContext = createContext<PreferencesValue | null>(null)

export function PreferencesProvider({ children, defaultTheme, defaultLanguage, defaultCollapsed }: PreferencesProviderProps) {
  const stored = useRef<StoredPreferences>(readStored())
  const [theme, setTheme] = useState<ThemePreference>(defaultTheme)
  const [language, setLanguage] = useState<Language>(defaultLanguage)
  const [collapsed, setCollapsed] = useState<boolean>(stored.current.collapsed ?? defaultCollapsed)
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(
    stored.current.expandedSections ?? { dictionaries: true, knowledge: true }
  )
  const [aiPanelOpen, setAiPanelOpen] = useState<boolean>(stored.current.aiPanelOpen ?? true)
  const [systemDark, setSystemDark] = useState<boolean>(() => window.matchMedia('(prefers-color-scheme: dark)').matches)

  // Keep in sync with the Controls panel defaults.
  useEffect(() => setTheme(defaultTheme), [defaultTheme])
  useEffect(() => setLanguage(defaultLanguage), [defaultLanguage])
  useSkipFirst(() => setCollapsed(defaultCollapsed), [defaultCollapsed])

  useEffect(() => {
    const query = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [])

  const resolvedTheme: 'light' | 'dark' = theme === 'system' ? (systemDark ? 'dark' : 'light') : theme

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolvedTheme)
  }, [resolvedTheme])

  useEffect(() => {
    document.documentElement.lang = language
  }, [language])

  useEffect(() => {
    const value: StoredPreferences = { collapsed, expandedSections, aiPanelOpen }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  }, [collapsed, expandedSections, aiPanelOpen])

  const toggleSection = useCallback((id: string) => {
    setExpandedSections((prev) => ({ ...prev, [id]: !prev[id] }))
  }, [])

  const t = useCallback(
    (key: TranslationKey, vars?: Record<string, string | number>) => interpolate(translations[language][key], vars),
    [language]
  )

  const value = useMemo<PreferencesValue>(
    () => ({
      theme,
      setTheme,
      resolvedTheme,
      language,
      setLanguage,
      t,
      collapsed,
      setCollapsed,
      expandedSections,
      toggleSection,
      aiPanelOpen,
      setAiPanelOpen
    }),
    [theme, resolvedTheme, language, t, collapsed, expandedSections, toggleSection, aiPanelOpen]
  )

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>
}

export function usePreferences(): PreferencesValue {
  const context = useContext(PreferencesContext)
  if (!context) throw new Error('usePreferences must be used inside PreferencesProvider')
  return context
}

function readStored(): StoredPreferences {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as StoredPreferences) : {}
  } catch {
    return {}
  }
}

function useSkipFirst(effect: () => void, deps: React.DependencyList) {
  const first = useRef(true)
  useEffect(() => {
    if (first.current) {
      first.current = false
      return
    }
    effect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

