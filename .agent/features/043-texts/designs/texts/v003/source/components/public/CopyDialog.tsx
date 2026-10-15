import React, { useEffect, useRef, useState } from 'react'
import { CopyIcon, RefreshCwIcon } from 'lucide-react'
import { Button } from '../Button'
import { Dialog, DialogActions } from '../Dialog'
import { InlineAlert } from '../InlineAlert'
import { Input } from '../Input'
import { Select } from '../Select'
import { useDemoSettings } from '../../contexts/DemoSettings'
import { useTextsStore } from '../../contexts/TextsStore'
import type { Folder, TextDoc } from '../../types/texts'

export const COPY_LIMIT = 500

interface CopyDialogProps {
  open: boolean
  mode: 'text' | 'folder'
  texts: TextDoc[]
  total: number
  defaultName: string
  onClose: () => void
  onDone: (folder: Folder, count: number) => void
}

export function CopyDialog({ open, mode, texts, total, defaultName, onClose, onDone }: CopyDialogProps) {
  const { folders, copyTexts } = useTextsStore()
  const { saveOutcome } = useDemoSettings()
  const active = folders.filter((f) => !f.archived)
  const [dest, setDest] = useState<'existing' | 'new'>(mode === 'folder' || active.length === 0 ? 'new' : 'existing')
  const [folderId, setFolderId] = useState(active[0]?.id ?? '')
  const [name, setName] = useState(defaultName)
  const [error, setError] = useState('')
  const [state, setState] = useState<'idle' | 'working' | 'failed'>('idle')
  const attempts = useRef(0)
  const overLimit = mode === 'folder' && total > COPY_LIMIT

  useEffect(() => {
    if (open) {
      setDest(mode === 'folder' || active.length === 0 ? 'new' : 'existing')
      setName(defaultName)
      setError('')
      setState('idle')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const submit = () => {
    if (state === 'working' || overLimit) return
    if (dest === 'new' && !name.trim()) {
      setError('Enter a folder name.')
      return
    }
    setState('working')
    window.setTimeout(() => {
      if (saveOutcome === 'failure' && attempts.current === 0) {
        attempts.current += 1
        setState('failed')
        return
      }
      attempts.current += 1
      const folder = copyTexts(texts, dest === 'existing' ? { folderId } : { newFolderName: name.trim() })
      setState('idle')
      onDone(folder, texts.length)
    }, 1300)
  }

  const working = state === 'working'

  return (
    <Dialog
      open={open}
      onClose={() => !working && onClose()}
      title={mode === 'folder' ? 'Copy whole folder' : 'Copy text to my folders'}
      dismissOnOverlayClick={!working}
      dismissOnEscape={!working}
      footer={
        <DialogActions>
          <Button variant="secondary" onClick={onClose} disabled={working}>
            Cancel
          </Button>
          <Button onClick={submit} loading={working} disabled={overLimit} leadingIcon={<CopyIcon className="h-4 w-4" />}>
            {mode === 'folder' ? `Copy ${total} texts` : 'Make a copy'}
          </Button>
        </DialogActions>
      }
    >
      <div className="space-y-4">
        <p className="rounded-xl bg-background-subtle p-3 text-sm leading-6 text-text-secondary">
          <span className="font-medium text-text-primary">Your copy is independent.</span> Later edits by the owner, or the link being
          turned off, won’t change it — or any cards you collect.
        </p>

        {overLimit && (
          <InlineAlert tone="warning" title={`This folder has ${total} translated texts`}>
            Whole-folder copies are limited to {COPY_LIMIT} texts. Open the texts you need and copy them individually instead.
          </InlineAlert>
        )}

        {mode === 'text' && active.length > 0 && (
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium text-text-primary">Destination</legend>
            {(['existing', 'new'] as const).map((v) => (
              <label key={v} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border border-border-default px-3 focus-within:outline focus-within:outline-2 focus-within:outline-border-focus">
                <input type="radio" name="dest" value={v} checked={dest === v} onChange={() => setDest(v)} className="h-4 w-4 accent-primary-default" disabled={working} />
                <span className="text-sm text-text-primary">{v === 'existing' ? 'Add to one of my folders' : 'Create a new folder'}</span>
              </label>
            ))}
          </fieldset>
        )}

        {dest === 'existing' && mode === 'text' && (
          <Select
            label="Folder"
            fullWidth
            value={folderId}
            disabled={working}
            onChange={(e) => setFolderId(e.target.value)}
            options={active.map((f) => ({ label: f.name, value: f.id }))}
          />
        )}
        {(dest === 'new' || mode === 'folder') && !overLimit && (
          <Input
            label="New folder name"
            required
            value={name}
            disabled={working}
            error={error}
            onChange={(e) => {
              setName(e.target.value)
              if (error) setError('')
            }}
          />
        )}

        {working && (
          <p className="text-sm text-text-secondary" role="status" aria-live="polite">
            Copying… you can keep this open; repeated clicks won’t create extra copies.
          </p>
        )}
        {state === 'failed' && (
          <InlineAlert
            tone="error"
            title="The copy didn’t finish"
            actions={
              <Button size="compact" variant="secondary" onClick={submit} leadingIcon={<RefreshCwIcon className="h-4 w-4" />}>
                Try again
              </Button>
            }
          >
            Nothing was copied, so trying again won’t create duplicates.
          </InlineAlert>
        )}
      </div>
    </Dialog>
  )
}
