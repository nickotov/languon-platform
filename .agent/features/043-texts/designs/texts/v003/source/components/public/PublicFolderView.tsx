import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowRightIcon, BookOpenIcon, CopyIcon, FolderIcon } from 'lucide-react'
import { Button } from '../Button'
import { languageName } from '../../utils/languages'
import type { Folder, TextDoc } from '../../types/texts'

interface PublicFolderViewProps {
  token: string
  folder: Folder
  texts: TextDoc[]
  total: number
  onCopyFolder: () => void
  onCopyText: (text: TextDoc) => void
}

export function PublicFolderView({ token, folder, texts, total, onCopyFolder, onCopyText }: PublicFolderViewProps) {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6 lg:py-12">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1 text-xs font-medium text-text-tertiary">
            <FolderIcon className="h-3.5 w-3.5" aria-hidden /> Shared folder
          </p>
          <h1 className="mt-1 break-words text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">{folder.name}</h1>
          {folder.description && <p className="mt-2 max-w-2xl break-words text-sm leading-6 text-text-secondary sm:text-base">{folder.description}</p>}
          <p className="mt-2 text-sm text-text-tertiary">
            {total} translated {total === 1 ? 'text' : 'texts'} · updates when the owner saves new translations
          </p>
        </div>
        <Button variant="secondary" onClick={onCopyFolder} leadingIcon={<CopyIcon className="h-4 w-4" />} className="shrink-0">
          Copy whole folder
        </Button>
      </div>

      <ul className="mt-8 divide-y divide-border-default overflow-hidden rounded-2xl border border-border-default bg-background-surface">
        {texts.map((t) => (
          <li key={t.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
            <div className="min-w-0 flex-1">
              <h2 className="break-words text-base font-medium text-text-primary">{t.title}</h2>
              <p className="mt-1 inline-flex items-center gap-1 text-xs text-text-secondary">
                {languageName(t.sourceLang)} <ArrowRightIcon className="h-3 w-3" aria-label="to" /> {languageName(t.targetLang)}
              </p>
            </div>
            <div className="flex gap-2">
              <Link
                to={`/share/${token}/texts/${t.id}`}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary-default px-4 text-sm font-medium text-background-surface hover:bg-primary-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
              >
                <BookOpenIcon className="h-4 w-4" aria-hidden /> Read
              </Link>
              <Button variant="secondary" onClick={() => onCopyText(t)} aria-label={`Copy ${t.title}`} leadingIcon={<CopyIcon className="h-4 w-4" />}>
                Copy
              </Button>
            </div>
          </li>
        ))}
        {texts.length === 0 && <li className="px-5 py-8 text-center text-sm text-text-secondary">No translated texts here yet.</li>}
      </ul>
      {total > texts.length && (
        <p className="mt-3 text-xs text-text-tertiary">
          Showing {texts.length} of {total} texts in this preview.
        </p>
      )}
    </main>
  )
}
