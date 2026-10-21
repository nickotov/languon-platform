import { createContext, useContext } from 'react'
import type { ResourceKind } from '../types/navigation'

export type ShellValue = {
  openPalette: () => void
  openCreate: (kind: ResourceKind) => void
  openDrawer: () => void
  closeDrawer: () => void
}

export const ShellContext = createContext<ShellValue | null>(null)

export function useShell(): ShellValue {
  const context = useContext(ShellContext)
  if (!context) throw new Error('useShell must be used inside AppShell')
  return context
}

