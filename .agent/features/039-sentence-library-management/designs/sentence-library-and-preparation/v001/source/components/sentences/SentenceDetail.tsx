import React, { useEffect, useRef, useState } from 'react'
import { ArchiveIcon, ArrowLeftIcon, CheckCircle2Icon, ChevronDownIcon, ChevronUpIcon, ClockIcon, EyeOffIcon, RotateCcwIcon, XIcon } from 'lucide-react'
import { Button } from '../Button'
import { InlineAlert } from '../InlineAlert'
import { Skeleton } from '../Skeleton'
import { IconAction } from '../common/IconAction'
import { DirectionBadge, OwnershipMeta, StatusBadges } from './SentenceBadges'
import { HintGroups } from './HintGroups'
import { useInterfaceText } from '../../hooks/useInterfaceText'
import { useIsCompact } from '../../hooks/useMediaQuery'
import type { SavedSentence } from '../../types/sentenceLibrary'

export type DetailForcedState = 'loading' | 'failed' | 'removed'

interface SentenceDetailProps {
  sentence: SavedSentence | undefined
  onClose: () => void
  onArchiveToggle: (id: string, archive: boolean) => void
  /** Prototype outcome for the first load. */
  loadOutcome?: 'ok' | 'fail' | 'removed'
  forceState?: DetailForcedState
  /** Gallery frames render the panel in place instead of over the page. */
  inline?: boolean
  initiallyExpanded?: boolean
}

/** Desktop drawer / mobile full-height view. Preview only: no answer input, no score, no review record. */
export function SentenceDetail({ sentence, onClose, onArchiveToggle, loadOutcome = 'ok', forceState, inline = false, initiallyExpanded = false }: SentenceDetailProps) {
  const { L, lang } = useInterfaceText()
  const compact = useIsCompact()
  const panelRef = useRef<HTMLDivElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const [phase, setPhase] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [attempt, setAttempt] = useState(0)
  const [expanded, setExpanded] = useState(initiallyExpanded)
  const sentenceId = sentence?.id

  useEffect(() => {
    if (forceState) return undefined
    setPhase('loading')
    setExpanded(initiallyExpanded)
    const timer = window.setTimeout(() => setPhase(loadOutcome === 'fail' && attempt === 0 ? 'failed' : 'ready'), 450)
    return () => window.clearTimeout(timer)
  }, [sentenceId, attempt, loadOutcome, forceState, initiallyExpanded])

  // Focus management + Escape for the overlay variant.
  useEffect(() => {
    if (inline) return undefined
    headingRef.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return
      const focusable = panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')
      if (!focusable.length) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [inline, onClose])

  const removed = forceState === 'removed' || (!forceState && (loadOutcome === 'removed' || !sentence))
  const state: 'loading' | 'failed' | 'removed' | 'ready' = forceState ?? (removed ? 'removed' : phase)

  const header = (
    <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-border-default bg-background-surface px-4 py-3">
      {compact && !inline ? <IconAction size="sm" plain icon={<ArrowLeftIcon aria-hidden className="rtl:rotate-180" />} label={L('back')} onClick={onClose} /> : null}
      <h2 ref={headingRef} tabIndex={-1} id="sentence-detail-title" className="min-w-0 flex-1 text-base font-semibold text-text-primary focus:outline-none">
        {L('detailTitle')}
      </h2>
      {!compact || inline ? <IconAction size="sm" plain icon={<XIcon aria-hidden />} label={L('close')} onClick={onClose} /> : null}
    </div>
  )

  const body =
    state === 'loading' ? (
      <div role="status" aria-label={L('loading')} className="space-y-4 p-4">
        <Skeleton variant="rect" width="90%" height="1.75rem" />
        <Skeleton variant="rect" width="50%" height="1rem" />
        <Skeleton variant="rect" width="100%" height="3rem" />
        <Skeleton variant="rect" width="100%" height="7rem" />
      </div>
    ) : state === 'failed' ? (
      <div className="p-4">
        <InlineAlert tone="error" title={L('detailLoadFailed')} actions={<Button size="compact" variant="secondary" onClick={() => setAttempt((n) => n + 1)}>{L('retry')}</Button>}>
          {L('loadFailedBody')}
        </InlineAlert>
      </div>
    ) : state === 'removed' || !sentence ? (
      <div className="p-4">
        <InlineAlert tone="info" title={L('detailRemovedTitle')} actions={<Button size="compact" variant="secondary" onClick={onClose}>{L('backToList')}</Button>}>
          {L('detailRemovedBody')}
        </InlineAlert>
      </div>
    ) : (
      <div className="space-y-6 p-4">
        <section aria-label={L('sentenceLabel')} className="space-y-2">
          <p lang={sentence.sentenceLanguage} dir="auto" className="break-words text-xl font-medium leading-relaxed text-text-primary [overflow-wrap:anywhere]">
            {sentence.sentence}
          </p>
          <p className="text-sm text-text-secondary">{L('langLine', { from: lang(sentence.sentenceLanguage), to: lang(sentence.answerLanguage) })}</p>
          <div className="flex flex-wrap items-center gap-2">
            <DirectionBadge from={sentence.sentenceLanguage} to={sentence.answerLanguage} />
            <StatusBadges sentence={sentence} />
          </div>
          <OwnershipMeta sentence={sentence} />
        </section>

        <section className="rounded-xl border border-border-default">
          <button
            type="button"
            aria-expanded={expanded}
            aria-controls={`${sentence.id}-reference`}
            onClick={() => setExpanded((v) => !v)}
            className="flex w-full items-center justify-between gap-2 rounded-xl px-3 py-3 text-start text-sm font-semibold text-text-primary hover:bg-background-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            {L('referenceToggle')}
            {expanded ? <ChevronUpIcon aria-hidden className="h-4 w-4" /> : <ChevronDownIcon aria-hidden className="h-4 w-4" />}
          </button>
          {expanded ? (
            <div id={`${sentence.id}-reference`} className="space-y-1 border-t border-border-default px-3 py-3">
              <p lang={sentence.answerLanguage} dir="auto" className="break-words text-base text-text-primary [overflow-wrap:anywhere]">
                {sentence.reference}
              </p>
              <p className="text-xs text-text-secondary">{L('referenceNote')}</p>
            </div>
          ) : null}
        </section>

        <HintGroups sentence={sentence} />

        <StatusSection sentence={sentence} onArchiveToggle={onArchiveToggle} />
      </div>
    )

  if (inline) {
    return (
      <div role="region" aria-labelledby="sentence-detail-title" className="overflow-hidden rounded-xl border border-border-default bg-background-surface">
        {header}
        {body}
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div aria-hidden className="absolute inset-0 hidden bg-overlay lg:block" onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="sentence-detail-title"
        className="relative flex h-full w-full flex-col overflow-y-auto bg-background-surface pb-[env(safe-area-inset-bottom)] shadow-xl lg:w-[30rem] lg:border-s lg:border-border-default"
      >
        {header}
        {body}
      </div>
    </div>
  )
}

function StatusSection({ sentence, onArchiveToggle }: { sentence: SavedSentence; onArchiveToggle: (id: string, archive: boolean) => void }) {
  const { L } = useInterfaceText()
  const usable = !sentence.outdated && !sentence.archivedByMe && !sentence.globallyArchived
  const blockedOtherwise = sentence.archivedByMe && (sentence.outdated || sentence.globallyArchived)
  return (
    <section aria-labelledby={`${sentence.id}-status`} className="space-y-3 rounded-xl border border-border-default bg-background-subtle p-3">
      <h3 id={`${sentence.id}-status`} className="text-sm font-semibold text-text-primary">
        {L('statusTitle')}
      </h3>
      <ul className="space-y-2 text-sm">
        {usable ? <Reason icon={<CheckCircle2Icon aria-hidden className="h-4 w-4 text-success-default" />} text={L('statusCurrent')} /> : null}
        {sentence.outdated ? <Reason icon={<ClockIcon aria-hidden className="h-4 w-4 text-warning-default" />} text={L('statusOutdatedBody')} /> : null}
        {sentence.archivedByMe ? <Reason icon={<EyeOffIcon aria-hidden className="h-4 w-4 text-text-secondary" />} text={L('statusMineBody')} /> : null}
        {sentence.globallyArchived ? <Reason icon={<ArchiveIcon aria-hidden className="h-4 w-4 text-text-secondary" />} text={L('statusGlobalBody')} /> : null}
      </ul>
      {blockedOtherwise ? <p className="text-xs text-text-secondary">{L('restoreOnlyPersonal')}</p> : null}
      <Button
        size="compact"
        variant="secondary"
        leadingIcon={sentence.archivedByMe ? <RotateCcwIcon aria-hidden className="h-4 w-4" /> : <EyeOffIcon aria-hidden className="h-4 w-4" />}
        onClick={() => onArchiveToggle(sentence.id, !sentence.archivedByMe)}
      >
        {sentence.archivedByMe ? L('restore') : L('removeMine')}
      </Button>
    </section>
  )
}

function Reason({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <li className="flex items-start gap-2 text-text-primary">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>{text}</span>
    </li>
  )
}

