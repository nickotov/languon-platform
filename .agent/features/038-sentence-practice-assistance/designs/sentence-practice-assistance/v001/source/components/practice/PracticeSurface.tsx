import React, { useEffect, useMemo, useState } from 'react'
import { ArrowLeftIcon, HistoryIcon, MaximizeIcon, MinimizeIcon, SlidersHorizontalIcon, XIcon } from 'lucide-react'
import { Button } from '../Button'
import { IconAction } from '../common/IconAction'
import { PracticeShell } from './PracticeShell'
import { PracticeBody } from './PracticeBody'
import { PracticeActions } from './PracticeActions'
import { SessionResults } from './SessionResults'
import { AiSettingsView } from './AiSettingsView'
import { HistoryView, type HistoryViewProps } from './HistoryView'
import { LeaveGuard } from './LeaveGuard'
import { usePractice } from '../../contexts/PracticeContext'
import type { PracticeRound } from '../../hooks/usePracticeRound'
import type { Presentation } from '../../types/practice'
import { languageName } from '../../data/languages'

export type InnerView = 'main' | 'settings' | 'history'

interface PracticeSurfaceProps {
  round: PracticeRound
  dictionaryName: string
  lifetimeTotal: number
  presentation: Presentation
  compact: boolean
  contained?: boolean
  height?: number
  notice?: React.ReactNode
  onTogglePresentation: () => void
  /** Called after any guard is resolved. */
  onExit: () => void
  onSignIn: () => void
  /** Gallery seeds. */
  initialView?: InnerView
  initialGuard?: 'leave' | 'settings' | null
  initialSettingsValue?: string
  initialOpenHint?: number
  historyProps?: Partial<HistoryViewProps>
}

/** One controller, two screens (practice → results) and inline inner views. */
export function PracticeSurface({
  round,
  dictionaryName,
  lifetimeTotal,
  presentation,
  compact,
  contained = false,
  height,
  notice,
  onTogglePresentation,
  onExit,
  onSignIn,
  initialView = 'main',
  initialGuard = null,
  initialSettingsValue,
  initialOpenHint,
  historyProps,
}: PracticeSurfaceProps) {
  const practice = usePractice()
  const [view, setView] = useState<InnerView>(initialView)
  const [settingsValue, setSettingsValue] = useState(initialSettingsValue ?? practice.aiModel)
  const [justSaved, setJustSaved] = useState(false)
  const [guard, setGuard] = useState<{ variant: 'leave' | 'settings'; then: 'close' | 'back' } | null>(
    initialGuard ? { variant: initialGuard, then: initialGuard === 'settings' ? 'back' : 'close' } : null,
  )
  const config = round.config

  useEffect(() => {
    if (view === 'main') return
    const timer = window.setTimeout(() => document.querySelector<HTMLElement>(view === 'settings' ? '#ai-settings-title' : '#history-title')?.focus(), 30)
    return () => window.clearTimeout(timer)
  }, [view])

  useEffect(() => {
    if (round.status !== 'complete') return
    const timer = window.setTimeout(() => document.querySelector<HTMLElement>('#results-title')?.focus(), 30)
    return () => window.clearTimeout(timer)
  }, [round.status])

  const hasSavedExample = useMemo(
    () => (config ? practice.savedPoolFor(config.dictionaryId).some((ex) => ex.direction === config.direction && ex.status === 'current') : false),
    [config, practice],
  )

  const settingsDirty = view === 'settings' && settingsValue !== practice.aiModel
  const unsentDraft = round.status === 'active' && round.draft.trim().length > 0 && round.draft !== round.submitted && !round.finished
  const pendingLabel = round.busy ? (round.job.kind === 'check' ? 'Your AI check' : round.job.kind === 'generation' ? 'Preparing a sentence' : 'Loading') : null

  const backToPractice = () => {
    if (settingsDirty) return setGuard({ variant: 'settings', then: 'back' })
    setView('main')
    return undefined
  }

  const requestClose = () => {
    if (settingsDirty) return setGuard({ variant: 'settings', then: 'close' })
    if (unsentDraft || pendingLabel) return setGuard({ variant: 'leave', then: 'close' })
    onExit()
    return undefined
  }

  const confirmGuard = () => {
    const current = guard
    setGuard(null)
    if (!current) return
    if (current.variant === 'settings') {
      setSettingsValue(practice.aiModel)
      if (current.then === 'back') setView('main')
      else if (unsentDraft || pendingLabel) setGuard({ variant: 'leave', then: 'close' })
      else onExit()
      return
    }
    onExit()
  }

  const progress = (() => {
    if (!config) return null
    if (round.status === 'complete') return round.results?.wasReplay ? 'Replay complete' : 'Round complete'
    const direction = `${languageName(config.sentenceLanguage)} → ${languageName(config.answerLanguage)}`
    if (round.replayTotal) return `${direction} · Replay ${Math.max(round.position, 1)} of ${round.replayTotal}`
    return `${direction} · Sentence ${Math.max(round.position, 1)} · ${round.coverage.seen} of ${round.coverage.selected} words`
  })()

  const header = (
    <div className="flex items-center gap-2">
      {view !== 'main' ? (
        <IconAction size="md" icon={<ArrowLeftIcon aria-hidden className="rtl:rotate-180" />} label="Back to practice" onClick={backToPractice} />
      ) : null}
      <div className="min-w-0 flex-1">
        <h1 data-autofocus tabIndex={-1} className="truncate text-sm font-semibold text-text-primary outline-none sm:text-base">
          {view === 'settings' ? 'AI settings' : view === 'history' ? 'My practice history' : `Sentence practice · ${dictionaryName}`}
        </h1>
        {view === 'main' && progress ? <p className="truncate text-xs text-text-secondary">{progress}</p> : null}
        {view !== 'main' ? <p className="truncate text-xs text-text-secondary">Your answer and exercise are kept</p> : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
        {view === 'main' ? (
          <>
            <Button size="compact" variant="secondary" leadingIcon={<SlidersHorizontalIcon aria-hidden className="h-4 w-4" />} onClick={() => setView('settings')} aria-label="AI settings">
              <span className="hidden md:inline">AI settings</span>
            </Button>
            <IconAction size="sm" icon={<HistoryIcon aria-hidden />} label="My practice history" onClick={() => setView('history')} />
          </>
        ) : null}
        {!compact ? (
          <IconAction
            size="sm"
            icon={presentation === 'fullscreen' ? <MinimizeIcon aria-hidden /> : <MaximizeIcon aria-hidden />}
            label={presentation === 'fullscreen' ? 'Exit full screen' : 'Enter full screen'}
            onClick={onTogglePresentation}
          />
        ) : null}
        <Button size="compact" variant="secondary" leadingIcon={<XIcon aria-hidden className="h-4 w-4" />} onClick={requestClose} aria-label="Close practice">
          <span className="hidden sm:inline">Close</span>
        </Button>
      </div>
    </div>
  )

  const showFooter = view === 'main' && (round.status === 'active' || round.status === 'loading')

  const body =
    view === 'settings' ? (
      <AiSettingsView
        savedModel={practice.aiModel}
        value={settingsValue}
        onChange={(value) => {
          setSettingsValue(value)
          setJustSaved(false)
        }}
        onSave={() => {
          practice.setAiModel(settingsValue)
          setJustSaved(true)
        }}
        modelUnavailable={practice.scenario.model === 'unavailable'}
        pendingWork={round.busy}
        justSaved={justSaved}
      />
    ) : view === 'history' && config ? (
      <HistoryView dictionaryId={config.dictionaryId} {...historyProps} />
    ) : round.status === 'complete' ? (
      <SessionResults round={round} dictionaryName={dictionaryName} lifetimeTotal={lifetimeTotal} onReturn={requestClose} onOpenSettings={() => setView('settings')} />
    ) : (
      <PracticeBody
        round={round}
        hasSavedExample={hasSavedExample}
        onReturn={requestClose}
        onOpenSettings={() => setView('settings')}
        onSignIn={onSignIn}
        initialOpenHint={initialOpenHint}
      />
    )

  return (
    <PracticeShell
      contained={contained}
      height={height}
      label={`Sentence practice — ${dictionaryName}`}
      header={header}
      notice={view === 'main' ? notice : undefined}
      footer={showFooter ? <PracticeActions round={round} /> : undefined}
      onEscape={guard ? undefined : view !== 'main' ? backToPractice : requestClose}
      overlay={
        guard ? (
          <LeaveGuard variant={guard.variant} unsentDraft={unsentDraft} pendingLabel={pendingLabel} onKeep={() => setGuard(null)} onConfirm={confirmGuard} />
        ) : null
      }
    >
      {body}
    </PracticeShell>
  )
}

