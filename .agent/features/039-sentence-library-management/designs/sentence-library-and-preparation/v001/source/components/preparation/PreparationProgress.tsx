import React from 'react'
import { Loader2Icon, WifiOffIcon } from 'lucide-react'
import { RoundsList } from './RoundsList'
import { PreparationNotice, type NoticeActions } from './PreparationNotice'
import { useInterfaceText } from '../../hooks/useInterfaceText'
import { roundsFor } from '../../utils/preparation'
import type { PreparationRun, PrepRound } from '../../types/preparation'

interface PreparationProgressProps {
  run: PreparationRun
  actions: NoticeActions
  onStartRound: (round: PrepRound) => void
}

/** Word coverage is the main measure; reused/generated counts are secondary and never summed. */
export function PreparationProgress({ run, actions, onStartRound }: PreparationProgressProps) {
  const { P, direction } = useInterfaceText()
  const hideDetails = ['submitting', 'uncertain', 'stale', 'expired', 'access-lost'].includes(run.status)
  const firstRound = roundsFor(run)[0]
  const modeLabel = run.mode === 'new' ? P('nameNew') : run.mode === 'review' ? P('nameReview') : P('nameSavedFirst')

  const activityLine =
    run.status === 'submitting'
      ? P('submittingTitle')
      : run.status === 'checking'
        ? P('checking')
        : run.status === 'queued'
          ? P('queued')
          : run.status === 'running'
            ? run.activity === 'generating'
              ? P('generating')
              : P('reusing')
            : run.status === 'stopping'
              ? P('stopping')
              : null

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">
        {direction(run.sentenceLanguage, run.answerLanguage)} · {modeLabel}
      </p>

      <PreparationNotice run={run} actions={actions} />

      {activityLine ? (
        <p role="status" className="flex items-start gap-2 text-sm text-text-primary">
          <Loader2Icon aria-hidden className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary-default motion-reduce:animate-none" />
          <span>
            {activityLine}
            {run.status === 'stopping' ? <span className="block text-xs text-text-secondary">{P('noRefund')}</span> : null}
          </span>
        </p>
      ) : null}

      {run.slow && !hideDetails ? (
        <p className="flex items-center gap-2 rounded-lg bg-background-subtle p-2 text-xs text-text-secondary">
          <WifiOffIcon aria-hidden className="h-3.5 w-3.5" />
          {P('slow')}
        </p>
      ) : null}

      {!hideDetails ? (
        <>
          <div className="space-y-3 rounded-xl border border-border-default bg-background-subtle p-3">
            <p className="text-lg font-semibold text-text-primary" aria-live="polite">
              {P('readyWords', { done: run.covered, total: run.totalWords })}
            </p>
            <CoverageBar label={P('overall')} done={run.covered} total={run.totalWords} />
            {firstRound ? <CoverageBar label={P('firstRound')} done={firstRound.ready} total={firstRound.wordCount} /> : null}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-primary">
              <span>{P('reused', { n: run.reused })}</span>
              <span>{P('generated', { n: run.generated })}</span>
            </div>
            <p className="text-xs text-text-secondary">{P('countsNote')}</p>
          </div>

          <RoundsList run={run} onStartRound={onStartRound} />
        </>
      ) : null}
    </div>
  )
}

function CoverageBar({ label, done, total }: { label: string; done: number; total: number }) {
  const { P } = useInterfaceText()
  const pct = total ? Math.round((done / total) * 100) : 0
  const text = P('coverageBar', { done, total })
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="font-medium text-text-primary">{label}</span>
        <span className="text-text-secondary">{text}</span>
      </div>
      <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={total} aria-valuenow={done} aria-valuetext={text} className="h-2 overflow-hidden rounded-full bg-progress-track">
        <div className="h-full rounded-full bg-progress-fill transition-[width] duration-300 motion-reduce:transition-none" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

