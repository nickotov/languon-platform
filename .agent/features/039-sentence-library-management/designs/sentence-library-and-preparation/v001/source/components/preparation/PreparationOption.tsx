import React from 'react'
import { CoinsIcon, LayersIcon } from 'lucide-react'
import { Switch } from '../Switch'
import { useInterfaceText } from '../../hooks/useInterfaceText'
import { roundSizes } from '../../utils/preparation'
import type { PracticeMode } from '../../types/practice'

interface PreparationOptionProps {
  enabled: boolean
  onChange: (value: boolean) => void
  roundWords: number
  totalWords: number
  mode: PracticeMode
  zeroCredits: boolean
}

/** OFF by default. Explains round vs whole-dictionary scope and credit behaviour beside the choice. */
export function PreparationOption({ enabled, onChange, roundWords, totalWords, mode, zeroCredits }: PreparationOptionProps) {
  const { P, num } = useInterfaceText()
  const sizes = roundSizes(roundWords, totalWords)
  const modeNote = mode === 'new' ? P('modeNew') : mode === 'review' ? P('modeReview') : P('modeSavedFirst')

  return (
    <div className="space-y-3">
      <Switch label={P('switchLabel')} description={P('switchDesc')} checked={enabled} onCheckedChange={onChange} />
      {enabled ? (
        <div className="space-y-3 rounded-xl border border-border-default bg-background-subtle p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <ScopeTile label={P('roundScope', { n: roundWords })} />
            <ScopeTile label={P('prepScope', { n: totalWords })} strong />
          </div>
          <p className="text-xs text-text-secondary">{P('roundVsPrep')}</p>
          <p className="flex items-start gap-2 text-xs text-text-primary">
            <LayersIcon aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-secondary" />
            {P('roundPlan', { list: sizes.map((s) => num(s)).join(' → ') })}
          </p>
          <p className="flex items-start gap-2 text-xs text-text-primary">
            <CoinsIcon aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-text-secondary" />
            <span>
              {modeNote} {P('noEstimate')}
              {zeroCredits && mode !== 'review' ? <span className="mt-1 block font-medium">{P('savedOnlyZero')}</span> : null}
            </span>
          </p>
          <p className="text-xs text-text-secondary">{P('startWhenReady')}</p>
        </div>
      ) : null}
    </div>
  )
}

function ScopeTile({ label, strong = false }: { label: string; strong?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2 text-sm font-semibold text-text-primary ${strong ? 'border-primary-default bg-primary-subtle' : 'border-border-default bg-background-surface'}`}>
      {label}
    </div>
  )
}

