import type { Folder } from '../types/texts'

export const seedFolders: Folder[] = [
  {
    id: 'seed-daily',
    name: 'Daily reading',
    description: 'Short passages I read with my morning coffee.',
    archived: false,
    updatedAt: '2026-10-14T08:12:00Z',
    shareToken: null,
  },
  {
    id: 'seed-travel',
    name: 'Travel stories',
    description: 'Trip diaries and city walks — good for phrases I can use on the road.',
    archived: false,
    updatedAt: '2026-10-12T17:40:00Z',
    shareToken: 'travel-k3m9',
  },
  {
    id: 'seed-news',
    name: 'News in slow Spanish',
    description: '',
    archived: false,
    updatedAt: '2026-10-02T10:00:00Z',
    shareToken: null,
  },
  {
    id: 'seed-graded',
    name: 'Graded readers (B1) — chapters I finished last spring before the exam in Salamanca',
    description: 'Finished chapters, kept for reference.',
    archived: true,
    updatedAt: '2026-06-20T09:00:00Z',
    shareToken: null,
  },
]
