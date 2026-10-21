import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { initialResources } from '../data/resources'
import type { Resource, ResourceKind, ResourcePreviewState } from '../types/navigation'

type ResourcesValue = {
  items: Resource[]
  addResource: (kind: ResourceKind, title: string, languagePair?: string) => Resource
  previewState: ResourcePreviewState
}

const ResourcesContext = createContext<ResourcesValue | null>(null)

export function ResourcesProvider({ children, previewState }: { children: React.ReactNode; previewState: ResourcePreviewState }) {
  const [items, setItems] = useState<Resource[]>(initialResources)

  const addResource = useCallback((kind: ResourceKind, title: string, languagePair?: string) => {
    const resource: Resource = {
      id: `${slugify(title)}-${Date.now().toString(36)}`,
      kind,
      title,
      languagePair,
      count: kind === 'dictionary' ? 0 : undefined,
      minutesAgo: 0
    }
    setItems((prev) => [resource, ...prev])
    return resource
  }, [])

  const value = useMemo(() => ({ items, addResource, previewState }), [items, addResource, previewState])
  return <ResourcesContext.Provider value={value}>{children}</ResourcesContext.Provider>
}

export function useResources(): ResourcesValue {
  const context = useContext(ResourcesContext)
  if (!context) throw new Error('useResources must be used inside ResourcesProvider')
  return context
}

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'item'
}

