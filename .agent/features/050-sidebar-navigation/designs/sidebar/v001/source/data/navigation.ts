import {
  HouseIcon,
  GraduationCapIcon,
  RouteIcon,
  LanguagesIcon,
  FileTextIcon,
  LightbulbIcon
} from 'lucide-react'
import type { NavGroup, NavSection } from '../types/navigation'

export const navGroups: NavGroup[] = [
  { id: 'workspace' },
  { id: 'learning', labelKey: 'group.learning' },
  { id: 'library', labelKey: 'group.library' }
]

export const navSections: NavSection[] = [
  {
    id: 'home',
    labelKey: 'nav.home',
    icon: HouseIcon,
    path: '/',
    group: 'workspace',
    status: 'live',
    matchPrefixes: ['/'],
    exact: true
  },
  {
    id: 'lessons',
    labelKey: 'nav.lessons',
    icon: GraduationCapIcon,
    path: '/lessons',
    group: 'learning',
    status: 'planned',
    matchPrefixes: ['/lessons']
  },
  {
    id: 'courses',
    labelKey: 'nav.courses',
    icon: RouteIcon,
    path: '/courses',
    group: 'learning',
    status: 'planned',
    matchPrefixes: ['/courses']
  },
  {
    id: 'dictionaries',
    labelKey: 'nav.dictionaries',
    icon: LanguagesIcon,
    path: '/dictionaries',
    group: 'library',
    status: 'live',
    matchPrefixes: ['/dictionaries'],
    resources: {
      kind: 'dictionary',
      createLabelKey: 'action.newDictionary',
      viewAllLabelKey: 'action.viewAllDictionaries',
      emptyLabelKey: 'state.emptyDictionaries',
      previewLimit: 4
    }
  },
  {
    id: 'texts',
    labelKey: 'nav.texts',
    icon: FileTextIcon,
    path: '/texts',
    group: 'library',
    status: 'live',
    matchPrefixes: ['/texts'],
    resources: {
      kind: 'text',
      createLabelKey: 'action.newText',
      viewAllLabelKey: 'action.viewAllTexts',
      emptyLabelKey: 'state.emptyTexts',
      previewLimit: 4
    }
  },
  {
    id: 'knowledge',
    labelKey: 'nav.knowledge',
    icon: LightbulbIcon,
    path: '/knowledge',
    group: 'library',
    status: 'live',
    matchPrefixes: ['/knowledge'],
    resources: {
      kind: 'knowledge',
      createLabelKey: 'action.newKnowledge',
      viewAllLabelKey: 'action.viewAllKnowledge',
      emptyLabelKey: 'state.emptyKnowledge',
      previewLimit: 4
    }
  }
]

