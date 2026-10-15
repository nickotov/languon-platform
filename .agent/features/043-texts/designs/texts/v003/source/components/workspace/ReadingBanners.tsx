import React from 'react'
import { RefreshCwIcon } from 'lucide-react'
import { Button } from '../Button'
import { InlineAlert } from '../InlineAlert'
import { JobErrorAlert } from './JobErrorAlert'
import { JobProgress } from './JobProgress'
import type { WorkspaceController } from '../../hooks/useWorkspace'

interface ReadingBannersProps {
  ws: WorkspaceController
  onSave: () => void
  onDiscardProposal: () => void
  onRegenerate: () => void
}

export function ReadingBanners({ ws, onSave, onDiscardProposal, onRegenerate }: ReadingBannersProps) {
  const items: React.ReactNode[] = []
  const editedCount = ws.pairs.filter((p) => p.edited).length

  if (ws.phase === 'job' && ws.job?.kind === 'retranslate') {
    items.push(<JobProgress key="job" stage={ws.job.stage} retranslate onCancel={ws.cancelJob} />)
  }

  if (ws.jobError && ws.jobError.during === 'retranslate' && ws.phase === 'read') {
    items.push(
      <JobErrorAlert
        key="err"
        kind={ws.jobError.kind}
        during="retranslate"
        onRetry={() => ws.startJob('retranslate')}
        onExtendedModel={() => ws.startJob('retranslate', true)}
        onDismiss={() => ws.setJobError(null)}
      />,
    )
  }

  if ((ws.phase === 'preview' || ws.phase === 'proposal') && ws.previewExpired) {
    items.push(
      <InlineAlert
        key="expired"
        tone="warning"
        title="This translation preview expired"
        actions={
          <Button size="compact" onClick={onRegenerate} leadingIcon={<RefreshCwIcon className="h-4 w-4" />}>
            Regenerate translation
          </Button>
        }
      >
        Previews can be saved for 24 hours. Regenerate to get a fresh translation — your source text is unchanged
        {ws.phase === 'proposal' ? ', and so is your saved translation' : ''}.
      </InlineAlert>,
    )
  } else if (ws.phase === 'preview') {
    items.push(
      <InlineAlert key="preview" tone="info" title="Translation preview — not saved yet">
        Read it, compare sentences, then select Save to keep it. Unsaved previews can be saved for 24 hours.
      </InlineAlert>,
    )
  } else if (ws.phase === 'proposal') {
    items.push(
      <InlineAlert
        key="proposal"
        tone="tip"
        title="New translation ready — not saved"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button size="compact" onClick={onSave} loading={ws.saveState === 'saving'}>
              Save new translation
            </Button>
            <Button size="compact" variant="secondary" onClick={onDiscardProposal} disabled={ws.saveState === 'saving'}>
              Discard
            </Button>
          </div>
        }
      >
        Saving replaces your current translation
        {editedCount > 0 ? `, including ${editedCount} manually edited ${editedCount === 1 ? 'sentence' : 'sentences'}` : ''}. Discard to
        keep your saved version.
      </InlineAlert>,
    )
  }

  if (ws.saveState === 'error' && (ws.phase === 'preview' || ws.phase === 'proposal')) {
    items.push(
      <InlineAlert
        key="save-err"
        tone="error"
        title="Couldn’t save the translation"
        actions={
          <Button size="compact" variant="secondary" onClick={onSave} leadingIcon={<RefreshCwIcon className="h-4 w-4" />}>
            Try again
          </Button>
        }
      >
        Your translation is still here. Check your connection and try again.
      </InlineAlert>,
    )
  }

  if (ws.phase === 'read' && ws.doc?.status === 'edited' && !ws.jobError) {
    items.push(
      <p key="edited" className="rounded-xl border border-border-default bg-background-surface px-4 py-3 text-sm leading-6 text-text-secondary">
        <span className="font-medium text-text-primary">Edited after translation.</span> Sentences marked with a pencil were
        changed by you after the AI translation and haven’t been checked by AI.
      </p>,
    )
  }

  if (!items.length) return null
  return <div className="space-y-3">{items}</div>
}
