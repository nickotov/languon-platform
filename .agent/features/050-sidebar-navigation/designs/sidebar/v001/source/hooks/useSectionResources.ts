import { useCallback, useEffect, useMemo, useState } from 'react'
import { useResources } from '../contexts/ResourcesContext'
import type { Resource, ResourceKind, ResourceLoadState } from '../types/navigation'

/** Kinds already fetched this session — mirrors a query cache so re-opening is instant. */
const loadedKinds = new Set<ResourceKind>()

/**
 * Lazily loads quick-access resources for one section. Nothing is fetched until
 * the section is disclosed or its flyout opens (`enabled`).
 */
export function useSectionResources(kind: ResourceKind, enabled: boolean) {
  const { items, previewState } = useResources()
  const [status, setStatus] = useState<ResourceLoadState>(loadedKinds.has(kind) ? 'ready' : 'loading')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!enabled) return
    if (previewState === 'loading') return
    if (previewState === 'error' && attempt === 0) return
    if (loadedKinds.has(kind)) {
      setStatus('ready')
      return
    }
    setStatus('loading')
    const timer = window.setTimeout(() => {
      loadedKinds.add(kind)
      setStatus('ready')
    }, 450)
    return () => window.clearTimeout(timer)
  }, [enabled, kind, attempt, previewState])

  const retry = useCallback(() => setAttempt((n) => n + 1), [])

  const effectiveStatus: ResourceLoadState =
    previewState === 'loading' ? 'loading' : previewState === 'error' && attempt === 0 ? 'error' : status

  const list = useMemo<Resource[]>(
    () => (previewState === 'empty' ? [] : items.filter((r) => r.kind === kind)),
    [items, kind, previewState]
  )

  return { status: effectiveStatus, items: list, retry }
}

