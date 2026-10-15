import React, { useState } from 'react'
import { ArchiveIcon, CheckIcon } from 'lucide-react'
import { Button } from '../Button'
import { Dialog, DialogActions } from '../Dialog'

interface ArchiveDialogProps {
  open: boolean
  kind: 'folder' | 'text'
  name: string
  isShared: boolean
  onClose: () => void
  onConfirm: () => void
}

export function ArchiveDialog({ open, kind, name, isShared, onClose, onConfirm }: ArchiveDialogProps) {
  const [busy, setBusy] = useState(false)
  const label = kind === 'folder' ? 'folder' : 'text'

  const consequences = [
    kind === 'folder'
      ? 'The folder and its texts move to Archived and leave your active list.'
      : 'The text moves to Archived in this folder.',
    isShared
      ? `Its shared link stops working right away. Visitors will see that it’s unavailable.`
      : kind === 'folder'
        ? 'Any shared links for this folder stop working.'
        : 'If it was part of a shared folder, it no longer appears there.',
    `You can restore it anytime from Archived. Restored ${label}s stay private until you share them again.`,
    'Nothing is deleted. Saved copies and collected cards are not affected.',
  ]

  const confirm = () => {
    setBusy(true)
    window.setTimeout(() => {
      onConfirm()
      setBusy(false)
    }, 500)
  }

  return (
    <Dialog
      open={open}
      onClose={() => !busy && onClose()}
      size="sm"
      title={`Archive “${name}”?`}
      dismissOnOverlayClick={!busy}
      footer={
        <DialogActions>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button variant="danger" loading={busy} onClick={confirm} leadingIcon={<ArchiveIcon className="h-4 w-4" />}>
            Archive {label}
          </Button>
        </DialogActions>
      }
    >
      <ul className="space-y-3">
        {consequences.map((c) => (
          <li key={c} className="flex gap-3 text-sm leading-6 text-text-secondary">
            <CheckIcon className="mt-1 h-4 w-4 shrink-0 text-text-tertiary" aria-hidden />
            <span className="break-words">{c}</span>
          </li>
        ))}
      </ul>
    </Dialog>
  )
}
