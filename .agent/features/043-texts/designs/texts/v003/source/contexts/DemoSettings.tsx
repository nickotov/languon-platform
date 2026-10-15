import React, { createContext, useContext } from 'react'
import type { DemoSettings } from '../types/demo'

const DemoSettingsContext = createContext<DemoSettings | null>(null)

export function DemoSettingsProvider({ value, children }: { value: DemoSettings; children: React.ReactNode }) {
  return <DemoSettingsContext.Provider value={value}>{children}</DemoSettingsContext.Provider>
}

export function useDemoSettings(): DemoSettings {
  const ctx = useContext(DemoSettingsContext)
  if (!ctx) throw new Error('useDemoSettings must be used inside DemoSettingsProvider')
  return ctx
}
