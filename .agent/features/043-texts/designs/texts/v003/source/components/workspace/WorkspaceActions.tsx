import React from 'react'
import { PencilIcon, SaveIcon, WandSparklesIcon } from 'lucide-react'
import { Button } from '../Button'
import type { WorkspaceController } from '../../hooks/useWorkspace'

export interface WorkspaceHandlers {
  onTranslate: () => void
  onSaveDraft: () => void
  onSaveTranslation: () => void
  onBackToCompose: () => void
  onEdit: () => void
  onCancelEdit: () => void
  onSaveChanges: () => void
  onDiscardProposal: () => void
}

export function WorkspaceActions({ ws, h, layout }: { ws: WorkspaceController; h: WorkspaceHandlers; layout: 'header' | 'bar' }) {
  const saving = ws.saveState === 'saving'
  const full = layout === 'bar'
  const wrap = full ? 'grid w-full auto-cols-fr grid-flow-col gap-2' : 'flex items-center gap-2'

  switch (ws.phase) {
    case 'compose':
      return (
        <div className={wrap}>
          <Button variant="secondary" onClick={h.onSaveDraft} loading={saving} leadingIcon={<SaveIcon className="h-4 w-4" />}>
            Save draft
          </Button>
          <Button onClick={h.onTranslate} disabled={saving} leadingIcon={<WandSparklesIcon className="h-4 w-4" />}>
            Translate via AI
          </Button>
        </div>
      )
    case 'job':
      return null
    case 'preview':
      return (
        <div className={wrap}>
          <Button variant={full ? 'secondary' : 'ghost'} onClick={h.onBackToCompose} disabled={saving}>
            Edit source
          </Button>
          <Button onClick={h.onSaveTranslation} loading={saving} disabled={ws.previewExpired} leadingIcon={<SaveIcon className="h-4 w-4" />}>
            Save
          </Button>
        </div>
      )
    case 'read':
      return (
        <div className={wrap}>
          <Button variant="secondary" onClick={h.onEdit} leadingIcon={<PencilIcon className="h-4 w-4" />}>
            Edit text
          </Button>
        </div>
      )
    case 'edit':
      return (
        <div className={wrap}>
          <Button variant="secondary" onClick={h.onCancelEdit} disabled={saving}>
            Cancel editing
          </Button>
          <Button onClick={h.onSaveChanges} loading={saving} leadingIcon={<SaveIcon className="h-4 w-4" />}>
            Save changes
          </Button>
        </div>
      )
    case 'proposal':
      return (
        <div className={wrap}>
          <Button variant="secondary" onClick={h.onDiscardProposal} disabled={saving}>
            Discard
          </Button>
          <Button onClick={h.onSaveTranslation} loading={saving} disabled={ws.previewExpired}>
            Save new translation
          </Button>
        </div>
      )
    default:
      return null
  }
}
