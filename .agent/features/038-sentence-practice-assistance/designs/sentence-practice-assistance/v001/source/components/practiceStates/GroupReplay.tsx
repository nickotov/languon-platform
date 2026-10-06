import React from 'react'
import { StateSection } from '../states/StateFrame'
import { LiveFrame } from './LiveFrame'
import { attempt, ex, item, job, mixedRoundItems, resultsState } from '../../utils/gallerySeeds'

export function GroupReplay() {
  const single = resultsState([item(ex.house, { attempts: [attempt(ex.house, 'Une maison confortable se trouve à côté d’une autre maison.')] })])
  const multi = resultsState(mixedRoundItems())
  return (
    <StateSection
      id="sph-g"
      title="G · Exact replay and fresh examples"
      description="Repeat these exact examples replays the same stored sentences, hints and references in the same order with fresh answers and counters. Generate new examples deliberately prepares fresh ones. Neither erases history; a failure keeps the completed results."
    >
      <LiveFrame label="Exact replay — single example (live)" ids={['SPH-11']} note="Select Repeat these exact examples." height={640} seed={{ state: single }} />
      <LiveFrame
        label="Exact replay — ordered multi-example with repeated words (live)"
        ids={['SPH-11']}
        note="Six examples, same order; “travail” and “demain” appear in more than one."
        height={760}
        seed={{ state: multi }}
      />
      <LiveFrame
        label="Replay in progress — example 2 of 3"
        ids={['SPH-11']}
        seed={{
          state: {
            status: 'active',
            replaySource: [ex.friend.id, ex.house.id, ex.idiom.id],
            items: [item(ex.friend, { attempts: [attempt(ex.friend, 'Je rends visite à un ami après le travail aujourd’hui.')] }), item(ex.house)],
            seen: ['card-fr-ami', 'card-fr-travail', 'card-fr-maison'],
          },
        }}
      />
      <LiveFrame label="Replay completed" ids={['SPH-11']} height={700} seed={{ state: resultsState([item(ex.friend, { skipped: true }), item(ex.house, { attempts: [attempt(ex.house, 'Une maison confortable se trouve à côté d’une autre maison.')] })], true) }} />
      <LiveFrame
        label="Loading saved replay"
        ids={['SPH-11', 'SPH-13']}
        height={460}
        seed={{ state: { status: 'loading', replaySource: [ex.friend.id, ex.house.id] }, job: job({ kind: 'replay', phase: 'running' }) }}
      />
      <LiveFrame
        label="Replay recovery after a dropped connection"
        ids={['SPH-11', 'SPH-13']}
        height={460}
        seed={{ state: { status: 'loading', replaySource: [ex.friend.id, ex.house.id] }, job: job({ kind: 'replay', phase: 'failed', failure: 'offline' }) }}
      />
      <LiveFrame label="Replay item outdated — no substitution" ids={['SPH-11', 'SPH-15']} height={760} seed={{ state: { ...multi, replayIssue: { position: 2, reason: 'outdated' } } }} />
      <LiveFrame label="Replay item revoked — no cached content shown" ids={['SPH-11', 'SPH-15']} height={760} seed={{ state: { ...multi, replayIssue: { position: 2, reason: 'revoked' } } }} />
      <LiveFrame
        label="Generate new examples — admission in progress"
        ids={['SPH-12']}
        height={760}
        seed={{ state: { ...multi, fresh: { phase: 'admitting', failure: null } }, job: job({ kind: 'generation', phase: 'queued' }) }}
      />
      <LiveFrame
        label="New generation failed — results kept"
        ids={['SPH-12', 'SPH-14']}
        height={760}
        seed={{ state: { ...multi, fresh: { phase: 'failed', failure: 'provider' } } }}
      />
      <LiveFrame
        label="No credits — fresh generation blocked, exact replay still possible (live)"
        ids={['SPH-12']}
        scenario={{ credits: 'zero' }}
        height={760}
        note="Select Generate new examples to see the honest refusal."
        seed={{ state: multi }}
      />
      <LiveFrame label="Model unavailable for new examples" ids={['SPH-12', 'SPH-17']} scenario={{ model: 'unavailable' }} height={760} seed={{ state: { ...multi, fresh: { phase: 'failed', failure: 'model' } } }} />
    </StateSection>
  )
}

