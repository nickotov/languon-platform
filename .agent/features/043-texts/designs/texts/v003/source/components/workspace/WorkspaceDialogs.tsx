import React from 'react'
import { Button } from '../Button'
import { Dialog, DialogActions } from '../Dialog'
import type { SentencePair } from '../../types/texts'

interface CloseDialogProps {
  open: boolean
  jobRunning: boolean
  canSave: boolean
  saveLabel: string
  saving: boolean
  onKeep: () => void
  onDiscard: () => void
  onSave: () => void
}

export function CloseConfirmDialog({ open, jobRunning, canSave, saveLabel, saving, onKeep, onDiscard, onSave }: CloseDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={() => !saving && onKeep()}
      size="sm"
      title={jobRunning ? 'Stop translating and close?' : 'Leave without saving?'}
      description={
        jobRunning
          ? 'The translation in progress will be cancelled. Unsaved text will be lost.'
          : 'You have changes that aren’t saved. If you leave now, they’ll be lost.'
      }
      dismissOnOverlayClick={!saving}
      footer={
        <DialogActions className="flex-wrap">
          <Button variant="secondary" onClick={onKeep} disabled={saving}>
            Keep editing
          </Button>
          <Button variant="danger" onClick={onDiscard} disabled={saving}>
            {jobRunning ? 'Stop and close' : 'Discard and close'}
          </Button>
          {canSave && !jobRunning && (
            <Button onClick={onSave} loading={saving}>
              {saveLabel}
            </Button>
          )}
        </DialogActions>
      }
    />
  )
}

interface SimpleConfirmProps {
  open: boolean
  title: string
  description: string
  confirmLabel: string
  danger?: boolean
  onCancel: () => void
  onConfirm: () => void
  cancelLabel?: string
}

export function SimpleConfirmDialog({ open, title, description, confirmLabel, danger, onCancel, onConfirm, cancelLabel = 'Cancel' }: SimpleConfirmProps) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      size="sm"
      title={title}
      description={description}
      footer={
        <DialogActions>
          <Button variant="secondary" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </DialogActions>
      }
    />
  )
}

interface ConflictDialogProps {
  open: boolean
  mine: SentencePair[]
  theirs: SentencePair[]
  saving: boolean
  onClose: () => void
  onUseNewer: () => void
  onKeepMine: () => void
}

export function ConflictReviewDialog({ open, mine, theirs, saving, onClose, onUseNewer, onKeepMine }: ConflictDialogProps) {
  const diffs = theirs
    .map((t, i) => ({ i, theirs: t, mine: mine.find((m) => m.id === t.id) }))
    .filter((d) => d.mine && (d.mine.target !== d.theirs.target || d.mine.source !== d.theirs.source))
  return (
    <Dialog
      open={open}
      onClose={() => !saving && onClose()}
      size="lg"
      title="Review the newer version"
      description="This text was saved on another device after you started editing. Compare, then choose which version to keep."
      footer={
        <DialogActions align="between" className="flex-wrap gap-2">
          <Button variant="secondary" onClick={onUseNewer} disabled={saving}>
            Use newer version
          </Button>
          <Button onClick={onKeepMine} loading={saving}>
            Save my version instead
          </Button>
        </DialogActions>
      }
    >
      <ul className="space-y-4">
        {diffs.map((d) => (
          <li key={d.theirs.id} className="rounded-xl border border-border-default p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Pair {d.i + 1}</p>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <div>
                <p className="text-xs font-medium text-text-secondary">Newer version (other device)</p>
                <p className="mt-1 break-words rounded-lg bg-background-subtle p-3 text-sm leading-6 text-text-primary">{d.theirs.target}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-text-secondary">Your edit (not saved)</p>
                <p className="mt-1 break-words rounded-lg bg-primary-subtle p-3 text-sm leading-6 text-text-primary">{d.mine?.target}</p>
              </div>
            </div>
          </li>
        ))}
        {diffs.length === 0 && <p className="text-sm text-text-secondary">The other device changed sentences you didn’t touch.</p>}
      </ul>
      <p className="mt-4 text-xs leading-5 text-text-tertiary">
        Saving your version replaces the newer one for all sentences. Nothing is overwritten until you choose.
      </p>
    </Dialog>
  )
}
