import React from 'react'
import { Link } from 'react-router-dom'
import { formatDistanceToNow } from 'date-fns'
import { ArchiveIcon, ArchiveRestoreIcon, ArrowRightIcon, Link2Icon, MoreHorizontalIcon, PencilIcon, Share2Icon } from 'lucide-react'
import { Badge } from '../Badge'
import { Button } from '../Button'
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../DropdownMenu'
import { TextStatusBadge } from './TextStatusBadge'
import { languageName } from '../../utils/languages'
import type { TextDoc } from '../../types/texts'

interface TextRowProps {
  text: TextDoc
  href: string
  readOnly: boolean
  onRename: () => void
  onShare: () => void
  onArchive: () => void
  onRestore: () => void
}

export function TextRow({ text, href, readOnly, onRename, onShare, onArchive, onRestore }: TextRowProps) {
  const canShare = text.status !== 'draft'
  return (
    <li className="relative flex items-start gap-3 px-4 py-4 transition-colors hover:bg-background-subtle sm:px-5">
      <div className="min-w-0 flex-1">
        <h3 className="break-words text-base font-medium leading-6 text-text-primary">
          {text.archived ? (
            text.title
          ) : (
            <Link
              to={href}
              className="rounded-sm after:absolute after:inset-0 hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-border-focus"
            >
              {text.title}
            </Link>
          )}
        </h3>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-text-secondary">
          <span className="inline-flex items-center gap-1 font-medium">
            {languageName(text.sourceLang)}
            <ArrowRightIcon className="h-3 w-3" aria-label="to" />
            {languageName(text.targetLang)}
          </span>
          <TextStatusBadge status={text.status} />
          {text.shareToken && (
            <Badge tone="info" size="sm" icon={<Link2Icon />}>
              Shared
            </Badge>
          )}
          <span className="text-text-tertiary">Updated {formatDistanceToNow(new Date(text.updatedAt), { addSuffix: true })}</span>
        </div>
      </div>
      <div className="relative z-10 flex shrink-0 items-center gap-1">
        {text.archived && !readOnly && (
          <Button variant="secondary" size="compact" onClick={onRestore} leadingIcon={<ArchiveRestoreIcon className="h-4 w-4" />}>
            Restore
          </Button>
        )}
        {!text.archived && !readOnly && (
          <DropdownMenu
            align="end"
            trigger={
              <DropdownMenuTrigger hideChevron aria-label={`Actions for ${text.title}`} className="flex h-10 w-10 items-center justify-center rounded-xl text-text-secondary hover:bg-background-surface">
                <MoreHorizontalIcon className="h-5 w-5" />
              </DropdownMenuTrigger>
            }
          >
            <DropdownMenuItem icon={<PencilIcon className="h-4 w-4" />} onSelect={onRename}>
              Rename
            </DropdownMenuItem>
            <DropdownMenuItem icon={<Share2Icon className="h-4 w-4" />} onSelect={onShare} disabled={!canShare}>
              {canShare ? 'Share text' : 'Share — translate and save first'}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem icon={<ArchiveIcon className="h-4 w-4" />} destructive onSelect={onArchive}>
              Archive
            </DropdownMenuItem>
          </DropdownMenu>
        )}
      </div>
    </li>
  )
}
