import React from 'react'
import { StateFrame, StateSection } from '../states/StateFrame'
import { InlineAlert } from '../InlineAlert'
import { PreparationProgress } from '../preparation/PreparationProgress'
import { PreparationOption } from '../preparation/PreparationOption'
import { SetupAiSettings } from '../preparation/SetupAiSettings'
import { ExistingRunCard } from '../preparation/ExistingRunCard'
import { PreparationChip } from '../preparation/PreparationChip'
import { useInterfaceText } from '../../hooks/useInterfaceText'
import { makeRun } from '../../utils/preparation'
import type { PreparationRun } from '../../types/preparation'
import { FR_ID, noticeNoop } from './StatesKit'

const noop = () => undefined
const run = (patch: Partial<PreparationRun>) => makeRun({ dictionaryId: FR_ID, id: 'demo', ...patch })

function Progress({ patch }: { patch: Partial<PreparationRun> }) {
  return (
    <div className="rounded-xl bg-background-surface p-3">
      <PreparationProgress run={run(patch)} actions={noticeNoop} onStartRound={noop} />
    </div>
  )
}

const FRAMES: { label: string; patch: Partial<PreparationRun>; theme?: 'dark' }[] = [
  { label: 'Submitting — waiting for the start to be accepted', patch: { status: 'submitting' } },
  { label: 'Uncertain start — check status before resending', patch: { status: 'uncertain' } },
  { label: 'Queued', patch: { status: 'queued' } },
  { label: 'Reusing saved examples', patch: { status: 'running', activity: 'reusing', covered: 24, reused: 7 } },
  { label: 'Active generation · partial first round', patch: { status: 'running', activity: 'generating', covered: 47, reused: 9, generated: 4, roundWords: 35 } },
  { label: 'Later rounds pending / ready', patch: { status: 'running', activity: 'generating', covered: 160, reused: 31, generated: 14 } },
  { label: 'Stopping — current generation settles', patch: { status: 'stopping', activity: 'generating', covered: 88, reused: 28, generated: 6 } },
  { label: 'Paused by learner', patch: { status: 'paused', covered: 88, reused: 28, generated: 6 } },
  { label: 'Insufficient credits with partial saved examples', patch: { status: 'interrupted', interruption: 'credits', covered: 112, reused: 34 } },
  { label: 'Temporary capacity', patch: { status: 'interrupted', interruption: 'capacity', covered: 61, reused: 18, generated: 3 } },
  { label: 'Model unavailable', patch: { status: 'interrupted', interruption: 'model', covered: 61, reused: 18, generated: 3 } },
  { label: 'Provider failure', patch: { status: 'interrupted', interruption: 'provider', covered: 61, reused: 18, generated: 3 } },
  { label: 'Network failure', patch: { status: 'interrupted', interruption: 'network', covered: 61, reused: 18, generated: 3 } },
  { label: 'Slow polling — last progress stays visible', patch: { status: 'running', activity: 'generating', covered: 70, reused: 20, generated: 5, slow: true } },
  { label: 'Completed — all 248 words', patch: { status: 'completed', covered: 248, reused: 40, generated: 39 } },
  { label: 'All words reused, no generation', patch: { status: 'completed', covered: 248, reused: 74, generated: 0, reuseBudget: 248 } },
  { label: 'Saved only — incomplete coverage', patch: { status: 'completed', mode: 'review', covered: 112, reused: 34, generated: 0 } },
  { label: 'Vocabulary/direction changed — stale', patch: { status: 'stale', covered: 90 } },
  { label: 'Inactive manifest expired', patch: { status: 'expired', covered: 130 } },
  { label: 'Sharing access lost', patch: { status: 'access-lost', accessLoss: 'revoked' } },
  { label: 'Signed out', patch: { status: 'access-lost', accessLoss: 'session' } },
  { label: 'Dictionary removed', patch: { status: 'access-lost', accessLoss: 'removed' } },
  { label: 'Dark theme · partial round', patch: { status: 'running', activity: 'generating', covered: 47, reused: 9, generated: 4 }, theme: 'dark' },
]

/** Setup option, background progress, recovery and access states. */
export function PreparationGroups() {
  const { P } = useInterfaceText()
  return (
    <>
      <StateSection id="prep-setup" title="5 · Preparation in setup" description="OFF by default. The round and the whole-dictionary scope are shown side by side; AI settings expand inline.">
        <StateFrame label="Option off (default)">
          <PreparationOption enabled={false} onChange={noop} roundWords={35} totalWords={248} mode="saved-first" zeroCredits={false} />
        </StateFrame>
        <StateFrame label="Option on · Saved first · 35 / 248">
          <PreparationOption enabled onChange={noop} roundWords={35} totalWords={248} mode="saved-first" zeroCredits={false} />
        </StateFrame>
        <StateFrame label="New examples">
          <PreparationOption enabled onChange={noop} roundWords={35} totalWords={248} mode="new" zeroCredits={false} />
        </StateFrame>
        <StateFrame label="Saved only, zero credits">
          <PreparationOption enabled onChange={noop} roundWords={35} totalWords={248} mode="review" zeroCredits />
        </StateFrame>
        <StateFrame label="AI settings expanded inline">
          <SetupAiSettings defaultOpen />
        </StateFrame>
        <StateFrame label="Concurrent preparation already present">
          <ExistingRunCard run={run({ status: 'running', covered: 47 })} onView={noop} onStop={noop} onResume={noop} />
        </StateFrame>
        <StateFrame label="Storage quota reached">
          <InlineAlert tone="warning" title={P('quota')}>
            {P('quotaBody')}
          </InlineAlert>
        </StateFrame>
        <StateFrame label="Persistent dictionary indicator">
          <div className="flex flex-wrap gap-2">
            <PreparationChip run={run({ status: 'running', covered: 47 })} onOpen={noop} />
            <PreparationChip run={run({ status: 'paused', covered: 88 })} onOpen={noop} />
            <PreparationChip run={run({ status: 'interrupted', interruption: 'credits', covered: 112 })} onOpen={noop} />
            <PreparationChip run={run({ status: 'completed', covered: 248 })} onOpen={noop} />
            <PreparationChip run={run({ status: 'expired' })} onOpen={noop} />
          </div>
        </StateFrame>
      </StateSection>

      <StateSection id="prep-progress" title="6 · Progress, recovery and access" description="Word coverage leads; reused and generated counts are secondary and never summed. No percentages of time, no refund promises.">
        {FRAMES.map((frame) => (
          <StateFrame key={frame.label} label={frame.label} theme={frame.theme}>
            <Progress patch={frame.patch} />
          </StateFrame>
        ))}
      </StateSection>
    </>
  )
}

