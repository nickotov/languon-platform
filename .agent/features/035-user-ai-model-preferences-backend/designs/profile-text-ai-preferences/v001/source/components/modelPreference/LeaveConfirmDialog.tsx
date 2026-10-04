import React from 'react'
import { Button } from '../Button'
import { Dialog, DialogActions } from '../Dialog'

interface LeaveConfirmDialogProps {
  open: boolean
  savedLabel: string
  draftLabel: string
  onKeepEditing: () => void
  onDiscard: () => void
}

export function LeaveConfirmDialog({
  open,
  savedLabel,
  draftLabel,
  onKeepEditing,
  onDiscard,
}: LeaveConfirmDialogProps) {
  return (
    <Dialog
      open={open}
      onClose={onKeepEditing}
      title="Discard your unsaved AI model change?"
      size="sm"
      footer={
        <DialogActions>
          <Button
            variant="ghost"
            className="dialog-quiet-action"
            onClick={onDiscard}
          >
            Discard changes
          </Button>
          <Button onClick={onKeepEditing}>Keep editing</Button>
        </DialogActions>
      }
    >
      <LeaveConfirmBody savedLabel={savedLabel} draftLabel={draftLabel} />
    </Dialog>
  )
}

export function LeaveConfirmBody({
  savedLabel,
  draftLabel,
}: {
  savedLabel: string
  draftLabel: string
}) {
  return (
    <div className="space-y-2 text-sm leading-relaxed text-text-secondary">
      <p>
        You picked <span className="font-semibold text-text-primary">{draftLabel}</span>{' '}
        but haven’t saved it.
      </p>
      <p>
        If you leave, your preference stays{' '}
        <span className="font-semibold text-text-primary">{savedLabel}</span>.
        Nothing that’s already running is affected.
      </p>
    </div>
  )
}

