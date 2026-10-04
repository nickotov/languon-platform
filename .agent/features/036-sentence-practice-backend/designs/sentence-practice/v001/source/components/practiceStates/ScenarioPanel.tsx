import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Button } from '../Button'
import { Select } from '../Select'
import { usePractice } from '../../contexts/PracticeContext'
import type { PracticeScenario } from '../../types/practice'

type Option<K extends keyof PracticeScenario> = { key: K; label: string; values: PracticeScenario[K][] }

const options: Option<keyof PracticeScenario>[] = [
  { key: 'feature', label: 'Sentence practice', values: ['enabled', 'disabled'] },
  { key: 'preparation', label: 'Preparation', values: ['ok', 'fail'] },
  { key: 'credits', label: 'AI credits', values: ['available', 'zero'] },
  { key: 'model', label: 'Selected model', values: ['available', 'unavailable'] },
  { key: 'capacity', label: 'AI capacity', values: ['ok', 'busy'] },
  { key: 'network', label: 'Network', values: ['online', 'offline'] },
  { key: 'generationOutcome', label: 'Generation outcome', values: ['success', 'retrying', 'fail', 'timeout'] },
  { key: 'checkOutcome', label: 'Check outcome', values: ['success', 'retrying', 'fail', 'timeout'] },
  { key: 'revealOutcome', label: 'Reference reveal', values: ['success', 'network-fail', 'outdated'] },
  { key: 'historyPage', label: 'History next page', values: ['ok', 'fail'] },
  { key: 'savedPool', label: 'Saved pool', values: ['partial', 'empty'] },
  { key: 'fullscreenApi', label: 'Browser full screen', values: ['available', 'unavailable'] },
] as Option<keyof PracticeScenario>[]

/** Review aid for the prototype. Not a product setting. */
export function ScenarioPanel() {
  const { scenario, setScenario, resetScenario } = usePractice()
  const navigate = useNavigate()

  return (
    <section
      aria-labelledby="scenario-heading"
      className="rounded-2xl border border-dashed border-border-strong bg-background-surface p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="scenario-heading" className="text-base font-semibold text-text-primary">
            Prototype review aids
          </h2>
          <p className="text-sm text-text-secondary">
            Simulated backend conditions for the live flow. These are not product settings.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="compact" variant="secondary" onClick={resetScenario}>
            Reset
          </Button>
          <Button size="compact" variant="secondary" onClick={() => navigate('/shared/dict-de-en?as=anonymous')}>
            Open as anonymous reader
          </Button>
          <Button size="compact" variant="secondary" onClick={() => navigate('/shared/dict-de-en')}>
            Open as signed-in reader
          </Button>
          <Button size="compact" onClick={() => navigate('/d/dict-de-en')}>
            Open as owner
          </Button>
        </div>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {options.map((option) => (
          <Select
            key={option.key}
            fullWidth
            label={option.label}
            value={String(scenario[option.key])}
            options={option.values.map((value) => ({ label: String(value), value: String(value) }))}
            onChange={(event) =>
              setScenario({ [option.key]: event.target.value } as Partial<PracticeScenario>)
            }
          />
        ))}
      </div>
    </section>
  )
}

