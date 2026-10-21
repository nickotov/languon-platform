import type { LucideIcon } from 'lucide-react'
import type { TranslationKey } from '../data/i18n'

export type NavGroupId = 'workspace' | 'learning' | 'library'

/** `planned` sections are registered for IA purposes but never rendered as working links. */
export type NavStatus = 'live' | 'planned'

export type ResourceKind = 'dictionary' | 'text' | 'knowledge'

export interface ResourceSectionConfig {
  kind: ResourceKind
  createLabelKey: TranslationKey
  viewAllLabelKey: TranslationKey
  emptyLabelKey: TranslationKey
  /** How many quick-access items to show in the sidebar / flyout. */
  previewLimit: number
}

export interface NavSection {
  id: string
  labelKey: TranslationKey
  icon: LucideIcon
  path: string
  group: NavGroupId
  status: NavStatus
  /** Route prefixes that keep this section active (e.g. nested resources). */
  matchPrefixes: string[]
  exact?: boolean
  resources?: ResourceSectionConfig
}

export interface NavGroup {
  id: NavGroupId
  labelKey?: TranslationKey
}

export interface Resource {
  id: string
  kind: ResourceKind
  title: string
  /** Language pair for dictionaries, e.g. "EN → RU". */
  languagePair?: string
  folder?: string
  count?: number
  dueCount?: number
  minutesAgo: number
  pinned?: boolean
}

export type ResourceLoadState = 'loading' | 'error' | 'ready'

/** Prototype-only override to preview loading / empty / error states. */
export type ResourcePreviewState = 'populated' | 'loading' | 'empty' | 'error'

export type ThemePreference = 'system' | 'light' | 'dark'

