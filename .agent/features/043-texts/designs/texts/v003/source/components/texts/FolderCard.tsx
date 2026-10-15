import React from 'react'
import { Link } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { ArchiveIcon, ArchiveRestoreIcon, FolderIcon, FolderOpenIcon, Link2Icon, MoreHorizontalIcon, PencilIcon, Share2Icon } from 'lucide-react'
import { Badge } from '../Badge'
import { Button } from '../Button'
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../DropdownMenu'
import type { Folder } from '../../types/texts'

interface FolderCardProps {
  folder: Folder
  textCount: number
  translatedCount: number
  onOpen: () => void
  onEdit: () => void
  onShare: () => void
  onArchive: () => void
  onRestore: () => void
}

export function FolderCard({ folder, textCount, translatedCount, onOpen, onEdit, onShare, onArchive, onRestore }: FolderCardProps) {
  const updated = formatDistanceToNow(new Date(folder.updatedAt), { addSuffix: true })
  return (
    <article className="relative flex flex-1 flex-col rounded-2xl border border-border-default bg-background-surface p-5 shadow-sm transition-colors hover:border-border-strong">
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-background-subtle text-text-secondary" aria-hidden>
          <FolderIcon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="break-words text-base font-semibold leading-6 text-text-primary">
            <Link
              to={`/texts/folders/${folder.id}`}
              className="rounded-sm after:absolute after:inset-0 after:rounded-2xl hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
            >
              {folder.name}
            </Link>
          </h3>
          {folder.description ? (
            <p className="mt-1 line-clamp-2 break-words text-sm leading-6 text-text-secondary">{folder.description}</p>
          ) : (
            <p className="mt-1 text-sm italic leading-6 text-text-tertiary">No description</p>
          )}
        </div>
        <div className="relative z-10 -mr-2 -mt-1">
          <DropdownMenu
            align="end"
            trigger={
              <DropdownMenuTrigger hideChevron aria-label={`Actions for ${folder.name}`} className="flex h-10 w-10 items-center justify-center rounded-xl text-text-secondary hover:bg-background-subtle">
                <MoreHorizontalIcon className="h-5 w-5" />
              </DropdownMenuTrigger>
            }
          >
            <DropdownMenuItem icon={<FolderOpenIcon className="h-4 w-4" />} onSelect={onOpen}>
              Open
            </DropdownMenuItem>
            {!folder.archived && (
              <>
                <DropdownMenuItem icon={<PencilIcon className="h-4 w-4" />} onSelect={onEdit}>
                  Edit details
                </DropdownMenuItem>
                <DropdownMenuItem icon={<Share2Icon className="h-4 w-4" />} onSelect={onShare} disabled={translatedCount === 0}>
                  {translatedCount === 0 ? 'Share — translate a text first' : 'Share folder'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem icon={<ArchiveIcon className="h-4 w-4" />} destructive onSelect={onArchive}>
                  Archive folder
                </DropdownMenuItem>
              </>
            )}
            {folder.archived && (
              <DropdownMenuItem icon={<ArchiveRestoreIcon className="h-4 w-4" />} onSelect={onRestore}>
                Restore folder
              </DropdownMenuItem>
            )}
          </DropdownMenu>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {folder.archived && <Badge tone="neutral" size="sm" icon={<ArchiveIcon />}>Archived</Badge>}
        {folder.shareToken && <Badge tone="info" size="sm" icon={<Link2Icon />}>Shared link</Badge>}
      </div>

      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-4 text-xs text-text-tertiary">
        <span>
          {textCount} {textCount === 1 ? 'text' : 'texts'} · {translatedCount} translated
        </span>
        <span>Updated {updated}</span>
      </div>

      {folder.archived && (
        <div className="relative z-10 mt-4 border-t border-border-default pt-4">
          <Button variant="secondary" size="compact" onClick={onRestore} leadingIcon={<ArchiveRestoreIcon className="h-4 w-4" />}>
            Restore
          </Button>
        </div>
      )}
    </article>
  )
}
