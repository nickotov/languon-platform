import type { Folder, TextDoc } from '../types/texts'
import { lisbonRows, riverRows } from './texts'

export interface SharedFolderFixture {
  token: string
  folder: Folder
  texts: TextDoc[]
  /** Total translated texts in the shared folder (only a few are listed in the prototype). */
  totalTranslated: number
}

function fixtureText(id: string, title: string, rows: typeof riverRows): TextDoc {
  const pairs = rows.map(([source, target, trailing], i) => ({
    id: `${id}-p${i + 1}`, source, target, trailing, edited: false,
  }))
  return {
    id, folderId: 'ext-club', title, sourceLang: 'en', targetLang: 'es', status: 'translated',
    draftSource: '', pairs, archived: false, updatedAt: '2026-10-09T10:00:00Z', version: 1, shareToken: null,
  }
}

/** A folder shared by another learner — used to show the visitor view and the 500-text copy limit. */
export const sharedFolderFixtures: SharedFolderFixture[] = [
  {
    token: 'club-anthology',
    folder: {
      id: 'ext-club',
      name: 'Reading club anthology',
      description: 'Every passage our Tuesday reading club has worked through since 2023.',
      archived: false,
      updatedAt: '2026-10-09T10:00:00Z',
      shareToken: 'club-anthology',
    },
    texts: [
      fixtureText('ext-river', 'By the river', riverRows),
      fixtureText('ext-lisbon', 'A morning in Lisbon', lisbonRows),
    ],
    totalTranslated: 612,
  },
]
