import React from 'react'
import { EyeOffIcon, Loader2Icon, RotateCcwIcon, XIcon } from 'lucide-react'
import { Button } from '../Button'
import { InlineAlert } from '../InlineAlert'
import { useInterfaceText } from '../../hooks/useInterfaceText'
import type { SentenceLibraryPage } from '../../hooks/useSentenceLibrary'

interface SelectionToolbarProps {
  page: Pick<SentenceLibraryPage, 'selection' | 'submission' | 'matchingTotal' | 'visible' | 'openConfirm' | 'dismissFailure' | 'filters'>
}

/** Contextual toolbar: honest scope counts, applicable action, clear selection, non-blocking progress. */
export function SelectionToolbar({ page }: SelectionToolbarProps) {
  const { L } = useInterfaceText()
  const { selection, submission, matchingTotal, visible } = page

  if (submission.status === 'submitting') {
    return (
      <div role="status" className="flex items-center gap-3 rounded-xl border border-border-strong bg-background-elevated p-3 text-sm text-text-primary shadow-lg">
        <Loader2Icon aria-hidden className="h-4 w-4 animate-spin text-primary-default motion-reduce:animate-none" />
        <span className="font-medium">{L('submitting')}</span>
        <span className="text-text-secondary">{L('submittingStatus')}</span>
      </div>
    )
  }

  if (selection.selectedCount === 0 && submission.status !== 'failed') return null

  const countLabel = selection.allMatching
    ? L('selAll', { n: matchingTotal })
    : selection.selectionIsPage
      ? L('selPage', { n: selection.selectedCount })
      : L('selIds', { n: selection.selectedCount })
  const canWiden = !selection.allMatching && selection.pageAllSelected && matchingTotal > visible.length

  return (
    <div role="region" aria-label={L('selectionToolbar')} className="space-y-2 rounded-xl border border-primary-default bg-background-elevated p-3 shadow-lg">
      {submission.status === 'failed' ? (
        <InlineAlert
          tone="error"
          title={L('failTitle')}
          onDismiss={page.dismissFailure}
          dismissLabel={L('close')}
          actions={
            <Button size="compact" variant="secondary" onClick={() => page.openConfirm(submission.action)}>
              {L('retry')}
            </Button>
          }
        >
          {L('failBody')}
        </InlineAlert>
      ) : null}
      {selection.selectedCount > 0 ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <p aria-live="polite" className="text-sm font-semibold text-text-primary">
            {countLabel}
          </p>
          {canWiden ? (
            <button type="button" onClick={selection.selectAllMatching} className="text-sm font-medium text-primary-default underline underline-offset-2 hover:text-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus">
              {L('selectAllMatching', { n: matchingTotal })}
            </button>
          ) : null}
          {selection.allMatching ? (
            <button type="button" onClick={selection.onlyThisPage} className="text-sm font-medium text-primary-default underline underline-offset-2 hover:text-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus">
              {L('onlyThisPage')}
            </button>
          ) : null}
          <div className="ms-auto flex flex-wrap items-center gap-2">
            {selection.archivableCount > 0 ? (
              <Button size="compact" leadingIcon={<EyeOffIcon aria-hidden className="h-4 w-4" />} onClick={() => page.openConfirm('archive')}>
                {L('removeMine')}
                {selection.restorableCount > 0 ? ` (${selection.archivableCount})` : ''}
              </Button>
            ) : null}
            {selection.restorableCount > 0 ? (
              <Button
                size="compact"
                variant={selection.archivableCount > 0 ? 'secondary' : 'primary'}
                leadingIcon={<RotateCcwIcon aria-hidden className="h-4 w-4" />}
                onClick={() => page.openConfirm('restore')}
              >
                {L('restore')}
                {selection.archivableCount > 0 ? ` (${selection.restorableCount})` : ''}
              </Button>
            ) : null}
            <Button size="compact" variant="secondary" leadingIcon={<XIcon aria-hidden className="h-4 w-4" />} onClick={selection.clear}>
              {L('clearSelection')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  )
}

