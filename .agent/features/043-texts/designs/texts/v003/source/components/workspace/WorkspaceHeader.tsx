import React from 'react'
import { ArchiveIcon, CheckIcon, CircleDotIcon, Loader2Icon, MoreHorizontalIcon, PencilIcon, RefreshCwIcon, Share2Icon, TriangleAlertIcon, XIcon } from 'lucide-react'
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../DropdownMenu'
import { IconButton } from '../IconButton'
import { TextStatusBadge } from '../texts/TextStatusBadge'
import { WorkspaceActions } from './WorkspaceActions'
import type { WorkspaceHandlers } from './WorkspaceActions'
import type { WorkspaceController } from '../../hooks/useWorkspace'

interface WorkspaceHeaderProps {
  ws: WorkspaceController
  h: WorkspaceHandlers
  onClose: () => void
  onRename: () => void
  onShare: () => void
  onRetranslate: () => void
  onArchive: () => void
}

function SaveIndicator({ label }: { label: string }) {
  const icon =
    label === 'Saving…' ? <Loader2Icon className="h-3.5 w-3.5 animate-spin" aria-hidden /> :
    label === 'Saved' ? <CheckIcon className="h-3.5 w-3.5 text-success-default" aria-hidden /> :
    label === 'Not saved' ? <TriangleAlertIcon className="h-3.5 w-3.5 text-danger-default" aria-hidden /> :
    <CircleDotIcon className="h-3.5 w-3.5 text-warning-default" aria-hidden />
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-xs text-text-secondary" role="status" aria-live="polite">
      {icon}
      {label}
    </span>
  )
}

export function WorkspaceHeader({ ws, h, onClose, onRename, onShare, onRetranslate, onArchive }: WorkspaceHeaderProps) {
  const displayTitle = ws.title.trim() || ws.doc?.title || 'New text'
  const status = ws.doc?.status
  const showMenu = Boolean(ws.doc) && (ws.phase === 'read' || ws.phase === 'compose')

  return (
    <header className="flex min-h-16 shrink-0 items-center gap-2 border-b border-border-default bg-background-surface px-2 py-2 sm:px-4">
      <IconButton icon={<XIcon />} label="Close text" variant="ghost" onClick={onClose} tooltipPlacement="bottom" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs text-text-tertiary">
          Texts <span aria-hidden>/</span> {ws.folder?.name}
        </p>
        <div className="flex min-w-0 items-center gap-2">
          <h1 id="workspace-title" className="truncate text-base font-semibold text-text-primary" title={displayTitle}>
            {displayTitle}
          </h1>
          {status && ws.phase !== 'compose' && (
            <span className="hidden shrink-0 md:inline-flex">
              <TextStatusBadge status={status} />
            </span>
          )}
        </div>
      </div>
      <span className="hidden sm:inline-flex">
        <SaveIndicator label={ws.unsavedLabel} />
      </span>
      <div className="hidden lg:flex">
        <WorkspaceActions ws={ws} h={h} layout="header" />
      </div>
      {showMenu && (
        <DropdownMenu
          align="end"
          trigger={
            <DropdownMenuTrigger hideChevron aria-label="Text options" className="flex h-11 w-11 items-center justify-center rounded-xl text-text-secondary hover:bg-background-subtle">
              <MoreHorizontalIcon className="h-5 w-5" />
            </DropdownMenuTrigger>
          }
        >
          <DropdownMenuItem icon={<PencilIcon className="h-4 w-4" />} onSelect={onRename}>
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem icon={<Share2Icon className="h-4 w-4" />} disabled={ws.phase !== 'read'} onSelect={onShare}>
            {ws.phase === 'read' ? (ws.doc?.shareToken ? 'Manage shared link' : 'Share text') : 'Share — translate and save first'}
          </DropdownMenuItem>
          {ws.phase === 'read' && (
            <DropdownMenuItem icon={<RefreshCwIcon className="h-4 w-4" />} onSelect={onRetranslate}>
              Retranslate via AI
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem icon={<ArchiveIcon className="h-4 w-4" />} destructive onSelect={onArchive}>
            Archive text
          </DropdownMenuItem>
        </DropdownMenu>
      )}
    </header>
  )
}
