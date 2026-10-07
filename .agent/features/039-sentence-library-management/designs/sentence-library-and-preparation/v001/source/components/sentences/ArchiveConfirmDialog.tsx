import React from 'react'
import { Dialog, DialogActions } from '../Dialog'
import { Button } from '../Button'
import { Badge } from '../Badge'
import { InlineAlert } from '../InlineAlert'
import { useInterfaceText } from '../../hooks/useInterfaceText'
import type { DialogState } from '../../hooks/useSentenceLibrary'
import type { Dictionary } from '../../types/dictionary'
import type { ArchiveAction, LibraryFilters } from '../../types/sentenceLibrary'

interface ArchiveConfirmDialogProps {
  dictionary: Dictionary
  state: DialogState
  filters: LibraryFilters
  zeroCredits: boolean
  onClose: () => void
  onConfirm: () => void
  onReconfirm: (action: ArchiveAction) => void
}

/** Precise count, scope and consequence. Personal and reversible — never global or permanent wording. */
export function ArchiveConfirmDialog({ dictionary, state, filters, zeroCredits, onClose, onConfirm, onReconfirm }: ArchiveConfirmDialogProps) {
  const { L } = useInterfaceText()
  if (state.kind === 'closed') return null

  const action: ArchiveAction = state.kind === 'confirm' ? state.snapshot.action : state.action
  const count = state.kind === 'stale' ? 0 : state.count
  const title =
    state.kind === 'stale'
      ? L('staleTitle')
      : state.kind === 'blocked'
        ? state.reason === 'too-many'
          ? L('tooManyTitle')
          : L('limitTitle')
        : action === 'archive'
          ? L('confirmRemoveTitle', { n: count })
          : L('confirmRestoreTitle', { n: count })

  return (
    <Dialog open onClose={onClose} size="md" title={title} className="bg-background-surface text-text-primary" footer={renderFooter()}>
      {state.kind === 'confirm' ? (
        <div className="space-y-4 text-sm">
          <ScopeSummary dictionary={dictionary} filters={filters} allMatching={state.snapshot.scope === 'all-matching'} />
          <p className="text-text-secondary">{action === 'archive' ? L('confirmRemoveBody') : L('confirmRestoreBody')}</p>
          {zeroCredits ? <p className="text-xs text-text-secondary">{L('zeroCredits')}</p> : null}
        </div>
      ) : state.kind === 'blocked' ? (
        <InlineAlert tone="info" title={state.reason === 'too-many' ? L('tooManyTitle') : L('limitTitle')}>
          {state.reason === 'too-many' ? L('tooManyBody') : L('limitBody')}
        </InlineAlert>
      ) : (
        <InlineAlert tone="warning" title={L('staleTitle')}>
          {state.reason === 'expired' ? L('expiredBody') : state.reason === 'superseded' ? L('supersededBody') : L('staleBody')}
        </InlineAlert>
      )}
    </Dialog>
  )

  function renderFooter() {
    return (
      <DialogActions>
        <Button variant="secondary" onClick={onClose}>
          {state.kind === 'confirm' ? L('cancel') : L('close')}
        </Button>
        {state.kind === 'confirm' ? (
          <Button onClick={onConfirm}>{action === 'archive' ? L('removeMine') : L('restore')}</Button>
        ) : state.kind === 'stale' ? (
          <Button onClick={() => onReconfirm(action)}>{L('reconfirm')}</Button>
        ) : null}
      </DialogActions>
    )
  }
}

function ScopeSummary({ dictionary, filters, allMatching }: { dictionary: Dictionary; filters: LibraryFilters; allMatching: boolean }) {
  const { L, direction } = useInterfaceText()
  const dirLabel =
    filters.direction === 'reverse'
      ? direction(dictionary.targetLanguage, dictionary.sourceLanguage)
      : direction(dictionary.sourceLanguage, dictionary.targetLanguage)
  const mine = { available: L('mineAvailable'), archived: L('mineArchived'), all: L('mineAll') }[filters.mine]
  const current = { all: L('curAll'), current: L('curCurrent'), outdated: L('curOutdated') }[filters.current]
  const global = { active: L('globActive'), archived: L('globArchived'), all: L('globAll') }[filters.global]
  return (
    <div className="rounded-lg border border-border-default bg-background-subtle p-3">
      <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">{L('confirmScope')}</p>
      <p className="mt-1 font-medium text-text-primary">{allMatching ? L('scopeAll') : L('scopeIds')}</p>
      <p className="mt-0.5 text-text-secondary">{dictionary.name}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Badge size="sm" tone="info">{dirLabel}</Badge>
        <Badge size="sm" tone="neutral">{`${L('filterMine')}: ${mine}`}</Badge>
        <Badge size="sm" tone="neutral">{`${L('filterCurrent')}: ${current}`}</Badge>
        <Badge size="sm" tone="neutral">{`${L('filterGlobal')}: ${global}`}</Badge>
      </div>
    </div>
  )
}

