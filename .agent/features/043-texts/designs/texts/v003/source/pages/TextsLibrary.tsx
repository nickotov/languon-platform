import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArchiveIcon, FolderPlusIcon, RefreshCwIcon } from 'lucide-react'
import { Button } from '../components/Button'
import { InlineAlert } from '../components/InlineAlert'
import { Skeleton } from '../components/Skeleton'
import { Tabs } from '../components/Tabs'
import { ArchiveDialog } from '../components/texts/ArchiveDialog'
import { FolderCard } from '../components/texts/FolderCard'
import { FolderFormDialog } from '../components/texts/FolderFormDialog'
import { ShareDialog } from '../components/texts/ShareDialog'
import { EmptyState } from '../components/ui/EmptyState'
import { useDemoSettings } from '../contexts/DemoSettings'
import { useTextsStore } from '../contexts/TextsStore'
import { useToast } from '../contexts/ToastContext'
import type { Folder } from '../types/texts'

type Dialogs =
  | { type: 'create' }
  | { type: 'edit'; folder: Folder }
  | { type: 'share'; folder: Folder }
  | { type: 'archive'; folder: Folder }
  | null

export function TextsLibrary() {
  const navigate = useNavigate()
  const { libraryState } = useDemoSettings()
  const { folders, texts, createFolder, updateFolder, setFolderArchived } = useTextsStore()
  const toast = useToast()
  const [load, setLoad] = useState<'loading' | 'ready' | 'error'>('loading')
  const [view, setView] = useState<'active' | 'archived'>('active')
  const [dialog, setDialog] = useState<Dialogs>(null)

  useEffect(() => {
    setLoad('loading')
    if (libraryState === 'loading') return
    const t = window.setTimeout(() => setLoad(libraryState === 'error' ? 'error' : 'ready'), 650)
    return () => window.clearTimeout(t)
  }, [libraryState])

  const retry = () => {
    setLoad('loading')
    window.setTimeout(() => setLoad('ready'), 800)
  }

  const visible = folders.filter((f) => (libraryState === 'empty' ? !f.id.startsWith('seed-') : true))
  const active = visible.filter((f) => !f.archived)
  const archived = visible.filter((f) => f.archived)
  const list = view === 'active' ? active : archived

  const counts = (id: string) => {
    const own = texts.filter((t) => t.folderId === id && !t.archived)
    return { total: own.length, translated: own.filter((t) => t.status !== 'draft').length }
  }

  const sharedFolder = dialog?.type === 'share' ? folders.find((f) => f.id === dialog.folder.id) : undefined

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6 lg:px-12 lg:py-12">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight text-text-primary sm:text-3xl">Texts</h1>
          <p className="mt-2 max-w-xl text-sm leading-6 text-text-secondary sm:text-base">
            Read passages next to their AI translation and save words to your dictionaries.
          </p>
        </div>
        <Button
          size="large"
          onClick={() => setDialog({ type: 'create' })}
          leadingIcon={<FolderPlusIcon className="h-5 w-5" />}
          disabled={load !== 'ready'}
        >
          New folder
        </Button>
      </header>

      {load === 'ready' && (active.length > 0 || archived.length > 0) && (
        <Tabs
          className="mt-8"
          variant="segmented"
          size="sm"
          aria-label="Folder lists"
          value={view}
          onValueChange={(v) => setView(v as 'active' | 'archived')}
          items={[
            { value: 'active', label: 'Folders', badge: active.length },
            { value: 'archived', label: 'Archived', icon: <ArchiveIcon className="h-4 w-4" />, badge: archived.length },
          ]}
        />
      )}

      <section aria-label={view === 'active' ? 'Folders' : 'Archived folders'} className="mt-6" aria-busy={load === 'loading'}>
        {load === 'loading' && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="rounded-2xl border border-border-default bg-background-surface p-5">
                <div className="flex gap-3">
                  <Skeleton variant="rect" width={40} height={40} />
                  <div className="flex-1">
                    <Skeleton width="60%" />
                    <Skeleton className="mt-3" lines={2} />
                  </div>
                </div>
                <Skeleton className="mt-6" width="40%" />
              </div>
            ))}
          </div>
        )}

        {load === 'error' && (
          <InlineAlert
            tone="error"
            title="We couldn’t load your folders"
            actions={
              <Button variant="secondary" size="compact" onClick={retry} leadingIcon={<RefreshCwIcon className="h-4 w-4" />}>
                Try again
              </Button>
            }
          >
            Check your connection and try again. Nothing in your library has changed.
          </InlineAlert>
        )}

        {load === 'ready' && list.length === 0 && view === 'active' && (
          <EmptyState
            icon={<FolderPlusIcon className="h-6 w-6" />}
            title="No folders yet"
            description="Folders keep your reading passages together so you can translate them and collect new words."
            action={
              <Button onClick={() => setDialog({ type: 'create' })} leadingIcon={<FolderPlusIcon className="h-4 w-4" />}>
                New folder
              </Button>
            }
          />
        )}

        {load === 'ready' && list.length === 0 && view === 'archived' && (
          <EmptyState
            icon={<ArchiveIcon className="h-6 w-6" />}
            title="Nothing archived"
            description="Archived folders appear here. You can restore them anytime."
          />
        )}

        {load === 'ready' && list.length > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {list.map((f) => {
              const c = counts(f.id)
              return (
                <li key={f.id} className="flex">
                  <div className="flex w-full flex-col">
                    <FolderCard
                      folder={f}
                      textCount={c.total}
                      translatedCount={c.translated}
                      onOpen={() => navigate(`/texts/folders/${f.id}`)}
                      onEdit={() => setDialog({ type: 'edit', folder: f })}
                      onShare={() => setDialog({ type: 'share', folder: f })}
                      onArchive={() => setDialog({ type: 'archive', folder: f })}
                      onRestore={() => {
                        setFolderArchived(f.id, false)
                        toast.push({
                          variant: 'success',
                          title: 'Folder restored',
                          description: `“${f.name}” is back in Folders. It stays private until you share it again.`,
                        })
                      }}
                    />
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <FolderFormDialog
        open={dialog?.type === 'create' || dialog?.type === 'edit'}
        mode={dialog?.type === 'edit' ? 'edit' : 'create'}
        initial={dialog?.type === 'edit' ? dialog.folder : undefined}
        onClose={() => setDialog(null)}
        onSubmit={(values) => {
          if (dialog?.type === 'edit') {
            updateFolder(dialog.folder.id, values)
            toast.push({ variant: 'success', title: 'Folder updated' })
          } else {
            const f = createFolder(values)
            toast.push({ variant: 'success', title: 'Folder created', action: { label: 'Open folder', onClick: () => navigate(`/texts/folders/${f.id}`) } })
            setView('active')
          }
          setDialog(null)
        }}
      />

      {dialog?.type === 'archive' && (
        <ArchiveDialog
          open
          kind="folder"
          name={dialog.folder.name}
          isShared={Boolean(dialog.folder.shareToken)}
          onClose={() => setDialog(null)}
          onConfirm={() => {
            setFolderArchived(dialog.folder.id, true)
            const name = dialog.folder.name
            const id = dialog.folder.id
            setDialog(null)
            toast.push({
              variant: 'info',
              title: 'Folder archived',
              description: `“${name}” moved to Archived.`,
              action: { label: 'Undo', onClick: () => setFolderArchived(id, false) },
            })
          }}
        />
      )}

      {sharedFolder && (
        <ShareDialog
          open
          kind="folder"
          id={sharedFolder.id}
          name={sharedFolder.name}
          shareToken={sharedFolder.shareToken}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  )
}
