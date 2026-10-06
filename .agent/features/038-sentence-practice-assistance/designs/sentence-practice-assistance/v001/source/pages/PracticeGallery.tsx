import React from 'react'
import { Badge } from '../components/Badge'
import { InlineAlert } from '../components/InlineAlert'
import { ScenarioPanel } from '../components/practiceStates/ScenarioPanel'
import { GroupSetup } from '../components/practiceStates/GroupSetup'
import { GroupHints } from '../components/practiceStates/GroupHints'
import { GroupDraft } from '../components/practiceStates/GroupDraft'
import { GroupFree } from '../components/practiceStates/GroupFree'
import { GroupWork } from '../components/practiceStates/GroupWork'
import { GroupResults } from '../components/practiceStates/GroupResults'
import { GroupReplay } from '../components/practiceStates/GroupReplay'
import { GroupLayout } from '../components/practiceStates/GroupLayout'
import { practiceCoverage, practiceOpenQuestions } from '../data/practiceCoverage'

const groups = [
  { id: 'sph-a', label: 'A Setup' },
  { id: 'sph-b', label: 'B Hints' },
  { id: 'sph-c', label: 'C Draft/check' },
  { id: 'sph-d', label: 'D Free action' },
  { id: 'sph-e', label: 'E Work/recovery' },
  { id: 'sph-f', label: 'F Final/results' },
  { id: 'sph-g', label: 'G Replay' },
  { id: 'sph-h', label: 'H Navigation/layout' },
]

export function PracticeGallery() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">Sentence practice — review gallery</h1>
        <p className="mt-1 max-w-[52rem] text-sm text-text-secondary">
          Review-only states for SPH-01 to SPH-20. Every frame runs the real practice controller in an isolated store, so hints, comparison, Stop request, Get result,
          replay and inner views stay clickable. Open a dictionary and choose Learn → Sentence practice for the end-to-end flow.
        </p>
      </div>

      <nav aria-label="Gallery groups" className="sticky top-0 z-10 -mx-1 overflow-x-auto bg-background-canvas py-2">
        <ul className="flex gap-2 px-1">
          {groups.map((group) => (
            <li key={group.id}>
              <a
                href={`#${group.id}-heading`}
                className="inline-flex min-h-9 items-center whitespace-nowrap rounded-full border border-border-strong bg-background-surface px-3 text-sm font-medium text-text-primary hover:bg-background-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              >
                {group.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <ScenarioPanel />

      <section aria-labelledby="sph-coverage" className="space-y-3">
        <h2 id="sph-coverage" className="text-lg font-semibold text-text-primary">Requirement coverage</h2>
        <ul className="grid gap-2 md:grid-cols-2">
          {practiceCoverage.map((row) => (
            <li key={row.id} className="flex gap-3 rounded-xl border border-border-default bg-background-surface p-3">
              <Badge size="sm" tone="info">{row.id}</Badge>
              <div className="min-w-0 text-sm">
                <p className="font-medium text-text-primary">{row.title}</p>
                <p className="text-text-secondary">{row.where}</p>
              </div>
            </li>
          ))}
        </ul>
        <InlineAlert tone="warning" title="Needs confirmation">
          <ul className="mt-1 list-disc space-y-1 ps-5">
            {practiceOpenQuestions.map((question) => <li key={question}>{question}</li>)}
          </ul>
        </InlineAlert>
      </section>

      <GroupSetup />
      <GroupHints />
      <GroupDraft />
      <GroupFree />
      <GroupWork />
      <GroupResults />
      <GroupReplay />
      <GroupLayout />
    </div>
  )
}

