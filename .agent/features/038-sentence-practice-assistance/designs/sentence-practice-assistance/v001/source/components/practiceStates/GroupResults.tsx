import React from 'react'
import { StateSection } from '../states/StateFrame'
import { LiveFrame } from './LiveFrame'
import { activeState, attempt, compared, ex, fromTemplate, item, job, mixedRoundItems, resultsState } from '../../utils/gallerySeeds'
import { withLongFeedback } from '../../utils/practiceGrading'

const DRAFT = 'Quand la pluie commence, j’entre dans une boulangerie à côté de la gare.'

export function GroupResults() {
  const rain = fromTemplate(1)
  const earlier = mixedRoundItems().slice(0, 5)
  const finalActive = (patch = {}) => ({ ...activeState(rain, { isFinal: true, draft: DRAFT, ...patch }, earlier) })

  return (
    <StateSection
      id="sph-f"
      title="F · Final sentence and results"
      description="When every selected word has appeared, no more sentences are prepared — but the last one stays answerable. A successful check (any score), a successful comparison or Skip finishes the round, and the results replace the exercise in the same surface."
    >
      <LiveFrame
        label="All words have appeared — last sentence still answerable (live)"
        ids={['SPH-09']}
        note="Check, compare or skip to see the results replace practice."
        height={720}
        seed={{ state: finalActive() }}
      />
      <LiveFrame label="Final check pending — not complete yet" ids={['SPH-09']} height={720} seed={{ state: finalActive({ submitted: DRAFT }), job: job({ phase: 'running' }) }} />
      <LiveFrame label="Final check failed — not complete, draft kept" ids={['SPH-09']} height={720} seed={{ state: finalActive({ submitted: DRAFT }), job: job({ phase: 'failed', failure: 'provider' }) }} />
      <LiveFrame
        label="Final reveal failed — not complete"
        ids={['SPH-09']}
        height={720}
        seed={{ state: finalActive({ reference: { phase: 'failed', comparison: null, failure: 'offline' } }) }}
      />
      <LiveFrame label="Results after a final AI check — feedback in details" ids={['SPH-01', 'SPH-10']} height={760} seed={{ state: resultsState(mixedRoundItems()) }} />
      <LiveFrame
        label="Results after a final manual comparison"
        ids={['SPH-09', 'SPH-10']}
        height={760}
        seed={{ state: resultsState([...earlier, item(rain, { reviewed: true, comparison: compared(DRAFT, rain.reference), finalDraft: DRAFT })]) }}
      />
      <LiveFrame label="Results after skipping the final sentence" ids={['SPH-09']} height={760} seed={{ state: resultsState([...earlier, item(rain, { skipped: true, finalDraft: DRAFT })]) }} />
      <LiveFrame
        label="Only skipped — complete but ungraded"
        ids={['SPH-10']}
        height={640}
        seed={{ state: resultsState([item(ex.friend, { skipped: true }), item(ex.house, { skipped: true })]) }}
      />
      <LiveFrame
        label="Only manual reviews — no AI score"
        ids={['SPH-10']}
        height={680}
        seed={{ state: resultsState([item(ex.friend, { reviewed: true, comparison: compared('', ex.friend.reference) }), item(ex.house, { reviewed: true, comparison: compared('Une maison confortable se trouve à côté d’une autre maison', ex.house.reference) })]) }}
      />
      <LiveFrame
        label="Only AI checks"
        ids={['SPH-10']}
        height={760}
        seed={{ state: resultsState([item(ex.friend, { attempts: [attempt(ex.friend, 'Je rends visite à un ami après le travail aujourd’hui.')] }), item(ex.idiom, { attempts: [attempt(ex.idiom, 'Demain je te tiens au courant')] })]) }}
      />
      <LiveFrame
        label="Long final details"
        ids={['SPH-10', 'SPH-16']}
        height={760}
        width={420}
        seed={{ state: resultsState([item(ex.friend, { attempts: [withLongFeedback(attempt(ex.friend, 'Aujourd’hui je visite un ami aprés le travial', false, 'en'))] })]) }}
      />
    </StateSection>
  )
}

