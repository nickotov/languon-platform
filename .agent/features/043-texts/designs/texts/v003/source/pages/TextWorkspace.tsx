import React, { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { FileTextIcon, RefreshCwIcon } from 'lucide-react'
import { Button } from '../components/Button'
import { InlineAlert } from '../components/InlineAlert'
import { Skeleton } from '../components/Skeleton'
import { ArchiveDialog } from '../components/texts/ArchiveDialog'
import { RenameTextDialog } from '../components/texts/RenameTextDialog'
import { ShareDialog } from '../components/texts/ShareDialog'
import { EmptyState } from '../components/ui/EmptyState'
import { CollectableReading } from '../components/vocab/CollectableReading'
import { ComposePane } from '../components/workspace/ComposePane'
import { LanguageBar } from '../components/workspace/LanguageBar'
import { PairEditor } from '../components/workspace/PairEditor'
import { ReadingBanners } from '../components/workspace/ReadingBanners'
import { WorkspaceActions } from '../components/workspace/WorkspaceActions'
import type { WorkspaceHandlers } from '../components/workspace/WorkspaceActions'
import { CloseConfirmDialog, ConflictReviewDialog, SimpleConfirmDialog } from '../components/workspace/WorkspaceDialogs'
import { WorkspaceHeader } from '../components/workspace/WorkspaceHeader'
import { useTextsStore } from '../contexts/TextsStore'
import { useToast } from '../contexts/ToastContext'
import { useIsCompact } from '../hooks/useMediaQuery'
import { useWorkspace } from '../hooks/useWorkspace'
import type { LanguageCode } from '../types/texts'

type DialogName = 'close' | 'retranslate' | 'back-to-compose' | 'cancel-edit' | 'rename' | 'share' | 'archive' | 'conflict' | null

export function TextWorkspace() {
  const { folderId = '', textId } = useParams()
  const navigate = useNavigate()
  const toast = useToast()
  const { setTextArchived, texts } = useTextsStore()
  const ws = useWorkspace(folderId, textId)
  const compact = useIsCompact()
  const [dialog, setDialog] = useState<DialogName>(null)
  const sourceRef = useRef<HTMLTextAreaElement>(null)
  const folderPath = `/texts/folders/${folderId}`
  const leave = () => navigate(folderPath)

  const handleClose = () => {
    if (ws.phase === 'job' || ws.unsaved) setDialog('close')
    else leave()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || dialog) return
      if (document.querySelector('[data-radix-popper-content-wrapper]')) return
      if (document.querySelectorAll('[role="dialog"][aria-modal="true"]').length > 1) return
      handleClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const h: WorkspaceHandlers = {
    onTranslate: () => {
      if (!ws.startJob('translate')) toast.push({ variant: 'warning', title: 'Check the highlighted fields', description: 'Both languages and some text are needed to translate.' })
    },
    onSaveDraft: () => ws.saveDraft(),
    onSaveTranslation: () => ws.saveTranslation(),
    onBackToCompose: () => setDialog('back-to-compose'),
    onEdit: ws.startEdit,
    onCancelEdit: () => (ws.touched.size ? setDialog('cancel-edit') : ws.cancelEdit()),
    onSaveChanges: () => ws.saveChanges(),
    onDiscardProposal: () => {
      ws.discardPreview()
      toast.push({ variant: 'info', title: 'Kept your saved translation', description: 'The new proposal was discarded.' })
    },
  }

  const canSaveOnClose =
    ws.phase === 'compose'
      ? !ws.errors.sourceLang && !ws.errors.targetLang && !ws.errors.text
      : ws.phase === 'preview' || ws.phase === 'proposal'
        ? !ws.previewExpired
        : ws.phase === 'edit'
          ? ws.emptyPairIds.length === 0
          : false
  const saveOnClose = () => {
    if (ws.phase === 'compose') ws.saveDraft(leave)
    else if (ws.phase === 'preview' || ws.phase === 'proposal') ws.saveTranslation(leave)
    else if (ws.phase === 'edit') ws.saveChanges(false, leave)
  }

  const shareDoc = ws.doc ? texts.find((t) => t.id === ws.doc?.id) : undefined
  const showComposer = ws.phase === 'compose' || (ws.phase === 'job' && ws.job?.kind === 'translate')
  const showReading = ws.phase === 'read' || ws.phase === 'preview' || ws.phase === 'proposal' || (ws.phase === 'job' && ws.job?.kind === 'retranslate')
  const readingPairs = (ws.phase === 'preview' || ws.phase === 'proposal') && ws.previewPairs ? ws.previewPairs : ws.pairs
  const hasBarActions = ws.phase !== 'job' && ws.phase !== 'loading' && ws.phase !== 'missing'

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="workspace-title"
      className="workspace-viewport fixed inset-0 z-40 flex flex-col bg-background-canvas"
    >
      {ws.phase === 'missing' || !ws.folder ? (
        <div className="flex flex-1 items-center justify-center p-4">
          <div className="w-full max-w-md">
            <h1 id="workspace-title" className="sr-only">Text unavailable</h1>
            <EmptyState
              icon={<FileTextIcon className="h-6 w-6" />}
              title="This text isn’t available"
              description="It may have been archived or moved out of your active list."
              action={<Button onClick={() => navigate(ws.folder ? folderPath : '/texts')}>Back to {ws.folder ? ws.folder.name : 'Texts'}</Button>}
            />
          </div>
        </div>
      ) : (
        <>
          <WorkspaceHeader
            ws={ws}
            h={h}
            onClose={handleClose}
            onRename={() => setDialog('rename')}
            onShare={() => setDialog('share')}
            onRetranslate={() => setDialog('retranslate')}
            onArchive={() => setDialog('archive')}
          />
          {ws.phase !== 'loading' && <LanguageBar ws={ws} />}

          <div className="min-h-0 flex-1">
            {ws.phase === 'loading' && (
              <div className="mx-auto grid max-w-6xl gap-10 px-4 py-8 sm:px-8 lg:grid-cols-2" aria-label="Loading text">
                <Skeleton lines={8} />
                <Skeleton lines={8} className="hidden lg:block" />
              </div>
            )}

            {showComposer && <ComposePane ref={sourceRef} ws={ws} compact={compact} />}

            {ws.phase === 'edit' && (
              <PairEditor
                ws={ws}
                topSlot={
                  <>
                    {ws.conflict && (
                      <InlineAlert
                        tone="warning"
                        title="This text changed on another device"
                        actions={
                          <div className="flex flex-wrap gap-2">
                            <Button size="compact" onClick={() => setDialog('conflict')}>
                              Review newer version
                            </Button>
                            <Button size="compact" variant="secondary" onClick={ws.reloadRemote} leadingIcon={<RefreshCwIcon className="h-4 w-4" />}>
                              Reload newer version
                            </Button>
                          </div>
                        }
                      >
                        Your edits are still here and nothing has been overwritten. Review the newer version before you save.
                      </InlineAlert>
                    )}
                    {ws.saveState === 'error' && !ws.conflict && (
                      <InlineAlert
                        tone="error"
                        title="Couldn’t save your changes"
                        actions={
                          <Button size="compact" variant="secondary" onClick={() => ws.saveChanges()} leadingIcon={<RefreshCwIcon className="h-4 w-4" />}>
                            Try again
                          </Button>
                        }
                      >
                        Your edits are still here. Check your connection and try again.
                      </InlineAlert>
                    )}
                    {ws.showErrors && ws.emptyPairIds.length > 0 && (
                      <InlineAlert tone="error" title="Some sentences are empty">
                        Fill them in before saving — sentence pairs can’t be removed.
                      </InlineAlert>
                    )}
                  </>
                }
              />
            )}

            {showReading && ws.sourceLang && ws.targetLang && (
              <CollectableReading
                key={ws.phase === 'proposal' || ws.phase === 'preview' ? 'proposal' : 'saved'}
                pairs={readingPairs}
                sourceLang={ws.sourceLang as LanguageCode}
                targetLang={ws.targetLang as LanguageCode}
                matchMode={ws.matchMode}
                compact={compact}
                tab={ws.mobileTab}
                onTabChange={ws.setMobileTab}
                previewExpired={ws.previewExpired}
                topSlot={
                  <ReadingBanners
                    ws={ws}
                    onSave={() => ws.saveTranslation()}
                    onDiscardProposal={h.onDiscardProposal}
                    onRegenerate={() => ws.startJob(ws.phase === 'proposal' ? 'retranslate' : 'translate', true)}
                  />
                }
              />
            )}
          </div>

          {compact && hasBarActions && (
            <div className="pb-safe shrink-0 border-t border-border-default bg-background-surface px-3 pt-2 lg:hidden">
              <p className="mb-2 text-xs text-text-tertiary sm:hidden" aria-hidden>
                {ws.unsavedLabel}
              </p>
              <WorkspaceActions ws={ws} h={h} layout="bar" />
            </div>
          )}
        </>
      )}

      <CloseConfirmDialog
        open={dialog === 'close'}
        jobRunning={ws.phase === 'job'}
        canSave={canSaveOnClose}
        saving={ws.saveState === 'saving'}
        saveLabel={ws.phase === 'compose' ? 'Save draft and close' : ws.phase === 'edit' ? 'Save changes and close' : 'Save and close'}
        onKeep={() => setDialog(null)}
        onDiscard={() => {
          if (ws.phase === 'job') ws.cancelJob()
          setDialog(null)
          leave()
        }}
        onSave={() => {
          setDialog(null)
          saveOnClose()
        }}
      />
      <SimpleConfirmDialog
        open={dialog === 'retranslate'}
        title="Retranslate via AI?"
        description={`AI will create a fresh translation of the whole passage. If you save it, it replaces the current translation${
          ws.pairs.some((p) => p.edited) ? ', including your manual translation edits' : ''
        }. Your saved version stays unchanged until then.`}
        confirmLabel="Retranslate"
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          setDialog(null)
          ws.startJob('retranslate')
        }}
      />
      <SimpleConfirmDialog
        open={dialog === 'back-to-compose'}
        title="Discard this translation preview?"
        description="You can edit the source text and translate again. This preview hasn’t been saved."
        confirmLabel="Discard preview"
        cancelLabel="Keep preview"
        danger
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          setDialog(null)
          ws.discardPreview()
        }}
      />
      <SimpleConfirmDialog
        open={dialog === 'cancel-edit'}
        title="Discard your edits?"
        description="Your changes to sentence pairs will be lost. The saved text stays as it was."
        confirmLabel="Discard edits"
        cancelLabel="Keep editing"
        danger
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          setDialog(null)
          ws.cancelEdit()
        }}
      />
      <ConflictReviewDialog
        open={dialog === 'conflict' && Boolean(ws.conflict)}
        mine={ws.editBuffer}
        theirs={ws.conflict ?? []}
        saving={ws.saveState === 'saving'}
        onClose={() => setDialog(null)}
        onUseNewer={() => {
          setDialog(null)
          ws.reloadRemote()
        }}
        onKeepMine={() => {
          setDialog(null)
          ws.saveChanges(true)
        }}
      />
      <RenameTextDialog
        open={dialog === 'rename'}
        title={ws.doc?.title ?? ''}
        onClose={() => setDialog(null)}
        onSave={(title) => {
          ws.rename(title)
          setDialog(null)
          toast.push({ variant: 'success', title: 'Title updated', description: 'The translation and its status didn’t change.' })
        }}
      />
      {dialog === 'share' && shareDoc && (
        <ShareDialog open kind="text" id={shareDoc.id} name={shareDoc.title} shareToken={shareDoc.shareToken} onClose={() => setDialog(null)} />
      )}
      {dialog === 'archive' && ws.doc && (
        <ArchiveDialog
          open
          kind="text"
          name={ws.doc.title}
          isShared={Boolean(ws.doc.shareToken)}
          onClose={() => setDialog(null)}
          onConfirm={() => {
            const id = ws.doc!.id
            setTextArchived(id, true)
            setDialog(null)
            navigate(folderPath)
            toast.push({ variant: 'info', title: 'Text archived', action: { label: 'Undo', onClick: () => setTextArchived(id, false) } })
          }}
        />
      )}
    </div>
  )
}
