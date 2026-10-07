import React from 'react'
import { EyeOffIcon, FilterXIcon, Loader2Icon, MessageSquareTextIcon } from 'lucide-react'
import { Button } from '../Button'
import { InlineAlert } from '../InlineAlert'
import { Skeleton } from '../Skeleton'
import { useInterfaceText } from '../../hooks/useInterfaceText'

export function LibrarySkeleton({ rows = 5 }: { rows?: number }) {
  const { L } = useInterfaceText()
  return (
    <div role="status" aria-label={L('loading')} className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-3 rounded-xl border border-border-default bg-background-surface p-4">
          <Skeleton variant="rect" width={20} height={20} />
          <div className="flex-1 space-y-2">
            <Skeleton variant="rect" width={`${70 - (i % 3) * 12}%`} height="1.1rem" />
            <Skeleton variant="rect" width="40%" height="0.85rem" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function LibraryLoadError({ onRetry }: { onRetry: () => void }) {
  const { L } = useInterfaceText()
  return (
    <InlineAlert tone="error" title={L('loadFailedTitle')} actions={<Button size="compact" variant="secondary" onClick={onRetry}>{L('retry')}</Button>}>
      {L('loadFailedBody')}
    </InlineAlert>
  )
}

type EmptyKind = 'none' | 'no-results' | 'archive-empty'

export function LibraryEmpty({ kind, onReset, onPractice }: { kind: EmptyKind; onReset?: () => void; onPractice?: () => void }) {
  const { L } = useInterfaceText()
  const Icon = kind === 'none' ? MessageSquareTextIcon : kind === 'archive-empty' ? EyeOffIcon : FilterXIcon
  const title = kind === 'none' ? L('emptyTitle') : kind === 'archive-empty' ? L('archiveEmptyTitle') : L('noResultsTitle')
  const body = kind === 'none' ? L('emptyBody') : kind === 'archive-empty' ? L('archiveEmptyBody') : L('noResultsBody')
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-border-default bg-background-surface px-4 py-10 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-background-subtle text-text-secondary">
        <Icon aria-hidden className="h-5 w-5" />
      </span>
      <h2 className="text-base font-semibold text-text-primary">{title}</h2>
      <p className="max-w-md text-sm text-text-secondary">{body}</p>
      {kind === 'none' && onPractice ? (
        <Button size="compact" onClick={onPractice}>
          {L('startPractice')}
        </Button>
      ) : null}
      {kind !== 'none' && onReset ? (
        <Button size="compact" variant="secondary" onClick={onReset}>
          {L('resetFilters')}
        </Button>
      ) : null}
    </div>
  )
}

export function LoadMore({ shown, total, status, onLoad }: { shown: number; total: number; status: 'idle' | 'loading' | 'error'; onLoad: () => void }) {
  const { L } = useInterfaceText()
  return (
    <div className="space-y-3">
      {status === 'error' ? (
        <InlineAlert tone="warning" title={L('nextPageFailed')} actions={<Button size="compact" variant="secondary" onClick={onLoad}>{L('retry')}</Button>} />
      ) : null}
      {status === 'loading' ? (
        <div role="status" className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-border-strong p-3 text-sm text-text-secondary">
          <Loader2Icon aria-hidden className="h-4 w-4 animate-spin motion-reduce:animate-none" />
          {L('loadingMore')}
        </div>
      ) : null}
      <div className="flex flex-col items-center gap-2">
        <p className="text-xs text-text-secondary">{L('shownOf', { shown, total })}</p>
        {shown < total && status === 'idle' ? (
          <Button variant="secondary" onClick={onLoad}>
            {L('showMore')}
          </Button>
        ) : null}
        {shown >= total ? <p className="text-xs text-text-tertiary">{L('allShown')}</p> : null}
      </div>
    </div>
  )
}

