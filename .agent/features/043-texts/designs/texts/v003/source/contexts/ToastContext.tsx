import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { Toast } from '../components/Toast'

type ToastVariant = 'info' | 'success' | 'warning' | 'error' | 'loading'

export interface ToastInput {
  title: string
  description?: string
  variant?: ToastVariant
  action?: { label: string; onClick: () => void }
  duration?: number | null
}

interface ToastItem extends ToastInput {
  id: string
  version: number
}

interface ToastApi {
  push: (t: ToastInput) => string
  update: (id: string, t: ToastInput) => void
  dismiss: (id: string) => void
}

const ToastContext = createContext<ToastApi | null>(null)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])

  const push = useCallback((t: ToastInput) => {
    const id = `toast-${Math.random().toString(36).slice(2, 9)}`
    setItems((prev) => [...prev.slice(-3), { ...t, id, version: 0 }])
    return id
  }, [])

  const update = useCallback((id: string, t: ToastInput) => {
    setItems((prev) => {
      const exists = prev.some((x) => x.id === id)
      if (!exists) return [...prev.slice(-3), { ...t, id, version: 0 }]
      return prev.map((x) => (x.id === id ? { ...t, id, version: x.version + 1 } : x))
    })
  }, [])

  const dismiss = useCallback((id: string) => setItems((prev) => prev.filter((x) => x.id !== id)), [])

  const api = useMemo(() => ({ push, update, dismiss }), [push, update, dismiss])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-stretch gap-2 p-3 pb-safe sm:items-end sm:p-6">
        {items.map((t) => (
          <div key={`${t.id}-${t.version}`} className="pointer-events-auto w-full sm:max-w-sm">
            <Toast
              title={t.title}
              description={t.description}
              variant={t.variant ?? 'info'}
              action={t.action}
              duration={t.variant === 'error' ? null : t.duration ?? 6000}
              onDismiss={() => dismiss(t.id)}
            />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be used inside ToastProvider')
  return ctx
}
