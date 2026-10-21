import { formatDistanceToNowStrict } from 'date-fns'
import { enUS, ru } from 'date-fns/locale'
import type { Language } from '../data/i18n'
import type { NavSection, Resource, ResourceKind } from '../types/navigation'

const kindBasePath: Record<ResourceKind, string> = {
  dictionary: '/dictionaries',
  text: '/texts',
  knowledge: '/knowledge'
}

export function resourcePath(resource: Pick<Resource, 'kind' | 'id'>): string {
  return `${kindBasePath[resource.kind]}/${resource.id}`
}

export function isSectionActive(section: NavSection, pathname: string): boolean {
  if (section.exact) return pathname === section.path
  return section.matchPrefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

/** Returns the resource id when the pathname points at a nested resource of `kind`. */
export function activeResourceId(kind: ResourceKind, pathname: string): string | null {
  const base = `${kindBasePath[kind]}/`
  return pathname.startsWith(base) ? pathname.slice(base.length).split('/')[0] || null : null
}

/**
 * Quick-access list: pinned first, then most recent. If the open resource is
 * not in the list it is prepended so the user never loses their place.
 */
export function quickAccessResources(items: Resource[], limit: number, activeId: string | null): Resource[] {
  const sorted = [...items].sort((a, b) => {
    if (Boolean(a.pinned) !== Boolean(b.pinned)) return a.pinned ? -1 : 1
    return a.minutesAgo - b.minutesAgo
  })
  const top = sorted.slice(0, limit)
  if (activeId && !top.some((r) => r.id === activeId)) {
    const active = items.find((r) => r.id === activeId)
    if (active) return [active, ...top.slice(0, limit - 1)]
  }
  return top
}

export function formatRelative(minutesAgo: number, language: Language): string {
  const date = new Date(Date.now() - minutesAgo * 60_000)
  return formatDistanceToNowStrict(date, { addSuffix: true, locale: language === 'ru' ? ru : enUS })
}

export function interpolate(template: string, vars?: Record<string, string | number>): string {
  if (!vars) return template
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ''))
}

