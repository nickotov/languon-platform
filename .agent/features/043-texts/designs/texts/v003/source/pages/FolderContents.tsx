import React, { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArchiveIcon, ArchiveRestoreIcon, FileTextIcon, Link2Icon, MoreHorizontalIcon, PencilIcon, PlusIcon, Share2Icon } from 'lucide-react'
import { Badge } from '../components/Badge'
import { Breadcrumb } from '../components/Breadcrumb'
import { Button } from '../components/Button'
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../components/DropdownMenu'
import { InlineAlert } from '../components/InlineAlert'
import { Skeleton } from '../components/Skeleton'
import { Tabs } from '../components/Tabs'
import { ArchiveDialog } from '../components/texts/ArchiveDialog'
import { FolderFormDialog } from '../components/texts/FolderFormDialog'
import { RenameTextDialog } from '../components/texts/RenameTextDialog'
import { ShareDialog } from '../components/texts/ShareDialog'
import { TextRow } from '../components/texts/TextRow'
import { EmptyState } from '../components/ui/EmptyState'
import { useTextsStore } from '../contexts/TextsStore'
import { useToast } from '../contexts/ToastContext'
import type { TextDoc } from '../types/texts'

type Dialogs =
  | { type: 'edit-folder' }
  | { type: 'share-folder' }
  | { type: 'archive-folder' }
  | { type: 'rename'; text: TextDoc }
  | { type: 'share-text'; textId: string }
  | { type: 'archive-text'; text: TextDoc }
  | null

export function FolderContents() {
  const { folderId = '' } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { folders, texts, updateFolder, setFolderArchived, updateTextTitle, setTextArchived } = useTextsStore()
  const folder = folders.find((f) => f.id === folderId)
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'active' | 'archived'>('active')
  const [dialog, setDialog] = useState<Dialogs>(null)

  useEffect(() => {
    setLoading(true)
    const t = window.setTimeout(() => setLoading(false), 450)
    return () => window.clearTimeout(t)
  }, [folderId])

  if (!folder) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <EmptyState
          icon={<FileTextIcon className="h-6 w-6" />}
          title="Folder not found"
          description="It may have been removed from this device’s list. Go back to your folders."
          action={<Button onClick={() => navigate('/texts')}>Back to Texts</Button>}
        />
      </div>
    )
  }

  const own = texts.filter((t) => t.folderId === folder.id)
  const active = own.filter((t) => !t.archived)
  const archived = own.filter((t) => t.archived)
  const list = view === 'active' ? active : archived
  const translatedCount = active.filter((t) => t.status !== 'draft').length
  const shareText = dialog?.type === 'share-text' ? texts.find((t) => t.id === dialog.textId) : undefined

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6 lg:px-12 lg:py-10">
      <Breadcrumb
        items={[
          { label: 'Texts', href: '/texts', onClick: (e) => { e.preventDefault(); navigate('/texts') } },
          { label: folder.name },
        ]}
      />

      <header className="mt-4 flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <h1 className="break-words text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">{folder.name}</h1>
          {folder.description && (
            <p className="mt-2 max-w-2xl break-words text-sm leading-6 text-text-secondary sm:text-base">{folder.description}</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {folder.archived && <Badge size="sm" icon={<ArchiveIcon />}>Archived</Badge>}
            {folder.shareToken && (
              <Badge tone="info" size="sm" icon={<Link2Icon />}>
                Shared · anyone with the link can read
              </Badge>
            )}
          </div>
        </div>
        {!folder.archived && (
          <div className="flex shrink-0 items-center gap-2">
            <DropdownMenu
              align="end"
              trigger={
                <DropdownMenuTrigger hideChevron aria-label="Folder options" className="flex h-11 w-11 items-center justify-center rounded-xl border border-border-default bg-background-surface text-text-secondary hover:bg-background-subtle">
                  <MoreHorizontalIcon className="h-5 w-5" />
                </DropdownMenuTrigger>
              }
            >
              <DropdownMenuItem icon={<PencilIcon className="h-4 w-4" />} onSelect={() => setDialog({ type: 'edit-folder' })}>
                Edit name & description
              </DropdownMenuItem>
              <DropdownMenuItem icon={<Share2Icon className="h-4 w-4" />} disabled={translatedCount === 0} onSelect={() => setDialog({ type: 'share-folder' })}>
                {translatedCount === 0 ? 'Share — translate a text first' : folder.shareToken ? 'Manage shared link' : 'Share folder'}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem icon={<ArchiveIcon className="h-4 w-4" />} destructive onSelect={() => setDialog({ type: 'archive-folder' })}>
                Archive folder
              </DropdownMenuItem>
            </DropdownMenu>
            <Button onClick={() => navigate(`/texts/folders/${folder.id}/new`)} leadingIcon={<PlusIcon className="h-4 w-4" />}>
              Add text
            </Button>
          </div>
        )}
      </header>

      {folder.archived && (
        <InlineAlert
          className="mt-6"
          tone="info"
          title="This folder is archived"
          actions={
            <Button
              variant="secondary"
              size="compact"
              leadingIcon={<ArchiveRestoreIcon className="h-4 w-4" />}
              onClick={() => {
                setFolderArchived(folder.id, false)
                toast.push({ variant: 'success', title: 'Folder restored', description: 'It stays private until you share it again.' })
              }}
            >
              Restore folder
            </Button>
          }
        >
          Restore it to add, edit or share texts. Restored folders stay private until you share them again.
        </InlineAlert>
      )}

      <Tabs
        className="mt-8"
        variant="underline"
        size="sm"
        aria-label="Texts in this folder"
        value={view}
        onValueChange={(v) => setView(v as 'active' | 'archived')}
        items={[
          { value: 'active', label: 'Texts', badge: active.length },
          { value: 'archived', label: 'Archived', badge: archived.length },
        ]}
      />

      <section className="mt-4" aria-busy={loading}>
        {loading ? (
          <div className="divide-y divide-border-default rounded-2xl border border-border-default bg-background-surface">
            {[0, 1, 2].map((i) => (
              <div key={i} className="p-5">
                <Skeleton width="45%" />
                <Skeleton className="mt-3" width="70%" />
              </div>
            ))}
          </div>
        ) : list.length === 0 ? (
          view === 'active' ? (
            <EmptyState
              icon={<FileTextIcon className="h-6 w-6" />}
              title="No texts in this folder yet"
              description="Add a passage to read it side by side with its translation."
              action={
                !folder.archived && (
                  <Button onClick={() => navigate(`/texts/folders/${folder.id}/new`)} leadingIcon={<PlusIcon className="h-4 w-4" />}>
                    Add text
                  </Button>
                )
              }
            />
          ) : (
            <EmptyState icon={<ArchiveIcon className="h-6 w-6" />} title="No archived texts" description="Texts you archive appear here, ready to restore." />
          )
        ) : (
          <ul className="divide-y divide-border-default overflow-hidden rounded-2xl border border-border-default bg-background-surface">
            {list.map((t) => (
              <TextRow
                key={t.id}
                text={t}
                href={`/texts/folders/${folder.id}/texts/${t.id}`}
                readOnly={folder.archived}
                onRename={() => setDialog({ type: 'rename', text: t })}
                onShare={() => setDialog({ type: 'share-text', textId: t.id })}
                onArchive={() => setDialog({ type: 'archive-text', text: t })}
                onRestore={() => {
                  setTextArchived(t.id, false)
                  toast.push({ variant: 'success', title: 'Text restored', description: 'It’s private until you share it again.' })
                }}
              />
            ))}
          </ul>
        )}
        {!loading && view === 'active' && folder.shareToken && (
          <p className="mt-3 text-xs leading-5 text-text-tertiary">
            Visitors to the shared folder see translated texts only — drafts and archived texts stay private.{' '}
            <Link to={`/share/${folder.shareToken}`} className="font-medium text-primary-default underline-offset-2 hover:underline">
              Preview public page
            </Link>
          </p>
        )}
      </section>

      <FolderFormDialog
        open={dialog?.type === 'edit-folder'}
        mode="edit"
        initial={folder}
        onClose={() => setDialog(null)}
        onSubmit={(v) => {
          updateFolder(folder.id, v)
          setDialog(null)
          toast.push({ variant: 'success', title: 'Folder updated' })
        }}
      />
      {dialog?.type === 'share-folder' && (
        <ShareDialog open kind="folder" id={folder.id} name={folder.name} shareToken={folder.shareToken} onClose={() => setDialog(null)} />
      )}
      {shareText && (
        <ShareDialog open kind="text" id={shareText.id} name={shareText.title} shareToken={shareText.shareToken} onClose={() => setDialog(null)} />
      )}
      {dialog?.type === 'archive-folder' && (
        <ArchiveDialog
          open
          kind="folder"
          name={folder.name}
          isShared={Boolean(folder.shareToken)}
          onClose={() => setDialog(null)}
          onConfirm={() => {
            setFolderArchived(folder.id, true)
            setDialog(null)
            toast.push({ variant: 'info', title: 'Folder archived', description: 'Find it under Archived in Texts.' })
            navigate('/texts')
          }}
        />
      )}
      {dialog?.type === 'archive-text' && (
        <ArchiveDialog
          open
          kind="text"
          name={dialog.text.title}
          isShared={Boolean(dialog.text.shareToken)}
          onClose={() => setDialog(null)}
          onConfirm={() => {
            const id = dialog.text.id
            setTextArchived(id, true)
            setDialog(null)
            toast.push({ variant: 'info', title: 'Text archived', action: { label: 'Undo', onClick: () => setTextArchived(id, false) } })
          }}
        />
      )}
      <RenameTextDialog
        open={dialog?.type === 'rename'}
        title={dialog?.type === 'rename' ? dialog.text.title : ''}
        onClose={() => setDialog(null)}
        onSave={(title) => {
          if (dialog?.type === 'rename') updateTextTitle(dialog.text.id, title)
          setDialog(null)
          toast.push({ variant: 'success', title: 'Title updated' })
        }}
      />
    </div>
  )
}
