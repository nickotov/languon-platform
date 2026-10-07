import React, { useState } from 'react'
import { CheckCircle2Icon, CircleDashedIcon, Clock3Icon, Loader2Icon, PlayIcon } from 'lucide-react'
import { Button } from '../Button'
import { Badge } from '../Badge'
import { useInterfaceText } from '../../hooks/useInterfaceText'
import { roundsFor } from '../../utils/preparation'
import type { PreparationRun, PrepRound } from '../../types/preparation'

const VISIBLE_ROUNDS = 3

/** Later prepared rounds stay discoverable without flooding the surface. */
export function RoundsList({ run, onStartRound, startDisabled = false }: { run: PreparationRun; onStartRound: (round: PrepRound) => void; startDisabled?: boolean }) {
  const { P } = useInterfaceText()
  const [expanded, setExpanded] = useState(false)
  const rounds = roundsFor(run)
  const shown = expanded ? rounds : rounds.slice(0, VISIBLE_ROUNDS)
  const active = run.status === 'running' || run.status === 'queued' || run.status === 'stopping'
  const filling = rounds.find((r) => r.ready < r.wordCount)?.index

  return (
    <section aria-labelledby="prep-rounds" className="space-y-2">
      <h3 id="prep-rounds" className="text-sm font-semibold text-text-primary">
        {P('roundsTitle')}
      </h3>
      <ol className="space-y-2">
        {shown.map((round) => {
          const state = round.ready >= round.wordCount ? 'ready' : round.ready > 0 ? 'partial' : active && round.index === filling ? 'progress' : 'pending'
          const usable = round.ready > 0 && !startDisabled
          const reasonId = `round-${round.index}-reason`
          return (
            <li key={round.index} className="rounded-lg border border-border-default bg-background-surface p-3">
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-sm font-semibold text-text-primary">{P('roundN', { i: round.index })}</span>
                <span className="text-sm text-text-secondary">{P('roundWords', { n: round.wordCount })}</span>
                <span className="text-sm text-text-secondary">{P('roundCoverage', { done: round.ready, total: round.wordCount })}</span>
                <RoundBadge state={state} />
                {active && round.index === filling && state === 'partial' ? (
                  <span className="inline-flex items-center gap-1 text-xs text-text-secondary">
                    <Loader2Icon aria-hidden className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" />
                    {P('stateInProgress')}
                  </span>
                ) : null}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button
                  size="compact"
                  variant={round.index === 1 ? 'primary' : 'secondary'}
                  leadingIcon={<PlayIcon aria-hidden className="h-4 w-4" />}
                  disabled={!usable}
                  aria-describedby={reasonId}
                  onClick={() => onStartRound(round)}
                >
                  {P('startReady')}
                </Button>
                <p id={reasonId} className="text-xs text-text-secondary">
                  {round.ready === 0
                    ? P('startDisabled')
                    : round.ready < round.wordCount
                      ? P('startReadyPartial', { done: round.ready, total: round.wordCount })
                      : P('startReadyFull')}
                </p>
              </div>
            </li>
          )
        })}
      </ol>
      {rounds.length > VISIBLE_ROUNDS ? (
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
          className="text-sm font-medium text-primary-default underline underline-offset-2 hover:text-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        >
          {expanded ? P('hideRounds') : P('showAllRounds', { n: rounds.length })}
        </button>
      ) : null}
    </section>
  )
}

function RoundBadge({ state }: { state: 'ready' | 'partial' | 'progress' | 'pending' }) {
  const { P } = useInterfaceText()
  if (state === 'ready') return <Badge size="sm" tone="success" icon={<CheckCircle2Icon aria-hidden />}>{P('stateReady')}</Badge>
  if (state === 'partial') return <Badge size="sm" tone="info" icon={<CircleDashedIcon aria-hidden />}>{P('statePartial')}</Badge>
  if (state === 'progress') return <Badge size="sm" tone="info" icon={<Loader2Icon aria-hidden className="animate-spin motion-reduce:animate-none" />}>{P('stateInProgress')}</Badge>
  return <Badge size="sm" tone="neutral" icon={<Clock3Icon aria-hidden />}>{P('statePending')}</Badge>
}

