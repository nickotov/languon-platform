import React from 'react'
import { useNavigate } from 'react-router-dom'
import { FlaskConicalIcon } from 'lucide-react'
import { Button } from '../components/Button'
import { Select } from '../components/Select'
import { LibraryGroups } from '../components/sentenceStates/LibraryGroups'
import { PreparationGroups } from '../components/sentenceStates/PreparationGroups'
import { useSentenceLibrary } from '../contexts/SentenceLibraryContext'
import { usePreparation } from '../contexts/PreparationContext'
import { FR_ID } from '../components/sentenceStates/StatesKit'

/** Review-only gallery for the saved-sentence library and preparation. Not product UI. */
export function SentenceStates() {
  return (
    <div className="space-y-8 pb-16">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold text-text-primary">Sentence library & preparation states</h1>
        <p className="max-w-3xl text-sm text-text-secondary">
          Every state for the saved-sentence library, archive/restore and optional preparation. Frames use the real components with fixed data. Copy follows the interface language chosen in the sidebar.
        </p>
      </header>
      <ReviewAids />
      <LibraryGroups />
      <PreparationGroups />
    </div>
  )
}

function ReviewAids() {
  const navigate = useNavigate()
  const library = useSentenceLibrary()
  const prep = usePreparation()
  const ls = library.scenario
  const ps = prep.scenario
  const pick = <T extends string>(label: string, value: T, options: T[], onChange: (v: T) => void) => (
    <Select size="sm" fullWidth label={label} value={value} onChange={(e) => onChange(e.target.value as T)} options={options.map((o) => ({ value: o, label: o }))} />
  )

  return (
    <section aria-labelledby="aids-heading" className="space-y-4 rounded-xl border border-dashed border-border-strong bg-background-surface p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="aids-heading" className="flex items-center gap-2 text-base font-semibold text-text-primary">
          <FlaskConicalIcon aria-hidden className="h-4 w-4" />
          Prototype review aids — fake backend conditions for the live flow
        </h2>
        <div className="flex flex-wrap gap-2">
          <Button size="compact" variant="secondary" onClick={() => { library.resetScenario(); prep.resetScenario() }}>Reset</Button>
          <Button size="compact" variant="secondary" onClick={() => navigate(`/d/${FR_ID}`)}>Open dictionary</Button>
          <Button size="compact" onClick={() => navigate(`/d/${FR_ID}/sentences`)}>Open saved sentences</Button>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {pick('Library initial load', ls.initialLoad, ['ok', 'slow', 'fail'], (v) => library.setScenario({ initialLoad: v }))}
        {pick('Next page', ls.nextPage, ['ok', 'fail'], (v) => library.setScenario({ nextPage: v }))}
        {pick('Detail', ls.detail, ['ok', 'fail', 'removed'], (v) => library.setScenario({ detail: v }))}
        {pick('Archive submit', ls.submit, ['success', 'fail', 'stale', 'expired', 'superseded'], (v) => library.setScenario({ submit: v }))}
        {pick('All-matching size', ls.matching, ['normal', 'oversized'], (v) => library.setScenario({ matching: v }))}
        {pick('Library contents', ls.empty ? 'empty' : 'seeded', ['seeded', 'empty'], (v) => library.setScenario({ empty: v === 'empty' }))}
        {pick('Credits', ps.credits, ['available', 'zero'], (v) => { prep.setScenario({ credits: v }); library.setScenario({ credits: v }) })}
        {pick('Preparation start', ps.startOutcome, ['success', 'uncertain', 'quota'], (v) => prep.setScenario({ startOutcome: v }))}
        {pick('Preparation interruption', ps.interruptAt, ['none', 'credits', 'capacity', 'model', 'provider', 'network'], (v) => prep.setScenario({ interruptAt: v }))}
        {pick('Saved coverage', ps.savedCoverage, ['partial', 'all'], (v) => prep.setScenario({ savedCoverage: v }))}
        {pick('Polling', ps.slowPolling ? 'slow' : 'normal', ['normal', 'slow'], (v) => prep.setScenario({ slowPolling: v === 'slow' }))}
      </div>
    </section>
  )
}

