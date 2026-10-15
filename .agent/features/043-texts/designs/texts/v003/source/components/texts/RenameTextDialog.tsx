import React, { useEffect, useState } from 'react'
import { Button } from '../Button'
import { Dialog, DialogActions } from '../Dialog'
import { Input } from '../Input'

interface RenameTextDialogProps {
  open: boolean
  title: string
  onClose: () => void
  onSave: (title: string) => void
}

export function RenameTextDialog({ open, title, onClose, onSave }: RenameTextDialogProps) {
  const [value, setValue] = useState(title)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setValue(title)
      setError('')
      setSaving(false)
    }
  }, [open, title])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!value.trim()) {
      setError('Enter a title.')
      return
    }
    setSaving(true)
    window.setTimeout(() => {
      onSave(value.trim())
      setSaving(false)
    }, 500)
  }

  return (
    <Dialog
      open={open}
      onClose={() => !saving && onClose()}
      size="sm"
      title="Rename text"
      footer={
        <DialogActions>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="rename-form" loading={saving}>
            Save title
          </Button>
        </DialogActions>
      }
    >
      <form id="rename-form" onSubmit={submit} noValidate>
        <Input
          label="Title"
          required
          autoFocus
          maxLength={160}
          value={value}
          error={error}
          hint="Renaming doesn’t change the text, its translation or its status."
          onChange={(e) => {
            setValue(e.target.value)
            if (error) setError('')
          }}
        />
      </form>
    </Dialog>
  )
}
