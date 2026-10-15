import React, { useEffect, useState } from 'react'
import { Button } from '../Button'
import { Dialog, DialogActions } from '../Dialog'
import { Input } from '../Input'
import { Textarea } from '../Textarea'

interface FolderFormDialogProps {
  open: boolean
  mode: 'create' | 'edit'
  initial?: { name: string; description: string }
  onClose: () => void
  onSubmit: (values: { name: string; description: string }) => void
}

export function FolderFormDialog({ open, mode, initial, onClose, onSubmit }: FolderFormDialogProps) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setName(initial?.name ?? '')
      setDescription(initial?.description ?? '')
      setError('')
      setSaving(false)
    }
  }, [open, initial?.name, initial?.description])

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Enter a folder name.')
      return
    }
    setSaving(true)
    window.setTimeout(() => {
      onSubmit({ name: name.trim(), description: description.trim() })
      setSaving(false)
    }, 600)
  }

  return (
    <Dialog
      open={open}
      onClose={() => !saving && onClose()}
      title={mode === 'create' ? 'New folder' : 'Edit folder details'}
      description={mode === 'create' ? 'Group related passages so they’re easy to find and share.' : undefined}
      dismissOnOverlayClick={!saving}
      dismissOnEscape={!saving}
      footer={
        <DialogActions>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="folder-form" loading={saving}>
            {mode === 'create' ? 'Create folder' : 'Save changes'}
          </Button>
        </DialogActions>
      }
    >
      <form id="folder-form" onSubmit={submit} className="space-y-4" noValidate>
        <Input
          label="Name"
          required
          autoFocus
          value={name}
          maxLength={80}
          placeholder="e.g. Daily reading"
          error={error}
          onChange={(e) => {
            setName(e.target.value)
            if (error) setError('')
          }}
        />
        <Textarea
          label="Description"
          description="Optional. A short note about what’s inside."
          rows={3}
          maxLength={140}
          showCount
          resize="none"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </form>
    </Dialog>
  )
}
