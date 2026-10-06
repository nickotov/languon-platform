import React from 'react'
import { StateSection } from '../states/StateFrame'
import { LiveFrame } from './LiveFrame'
import { activeState, ex, job } from '../../utils/gallerySeeds'

const DRAFT = 'Je rends visite à un ami après le travail aujourd’hui.'
const checking = (patch: Parameters<typeof job>[0]) => ({ state: activeState(ex.friend, { draft: DRAFT, submitted: DRAFT }), job: job({ kind: 'check', ...patch }) })
const preparing = (patch: Parameters<typeof job>[0]) => ({ state: { status: 'loading' as const }, job: job({ kind: 'generation', ...patch }) })

export function GroupWork() {
  return (
    <StateSection
      id="sph-e"
      title="E · Async work and recovery"
      description="Named operations, indeterminate progress, no invented queue positions or times. Work stays attached to its exercise and exact submitted answer. Recovery resumes the same request; it never creates a replacement paid request."
    >
      <LiveFrame label="Preparing a sentence — queued" ids={['SPH-13']} height={460} seed={preparing({ phase: 'queued' })} />
      <LiveFrame label="Preparing a sentence — running" ids={['SPH-13']} height={460} seed={preparing({ phase: 'running' })} />
      <LiveFrame label="Generation retrying automatically" ids={['SPH-13']} height={460} seed={preparing({ phase: 'recovering' })} />
      <LiveFrame label="Wrong-language generation — prepared again, never shown" ids={['SPH-14']} height={460} seed={preparing({ phase: 'recovering', failure: 'wrong-language' })} />
      <LiveFrame label="Bounded automatic retry during a check" ids={['SPH-13']} seed={checking({ phase: 'recovering' })} />
      <LiveFrame
        label="Known retry time — truthful countdown (live)"
        ids={['SPH-13']}
        note="Select Check with AI: the service’s retry time counts down, and Resume stays disabled until it ends."
        scenario={{ checkOutcome: 'retry-after' }}
        seed={{ state: activeState(ex.friend, { draft: DRAFT }) }}
      />
      <LiveFrame label="Long delay — explicit Resume checking" ids={['SPH-13']} seed={checking({ phase: 'delayed' })} />
      <LiveFrame label="Unknown outcome — Get result first" ids={['SPH-13']} seed={checking({ phase: 'uncertain' })} />
      <LiveFrame label="Poll/read failure — exercise not treated as deleted" ids={['SPH-13', 'SPH-14']} seed={checking({ phase: 'failed', failure: 'poll' })} />
      <LiveFrame label="Malformed AI result — no made-up score, free fallback" ids={['SPH-14']} seed={checking({ phase: 'failed', failure: 'malformed' })} />
      <LiveFrame label="Timeout" ids={['SPH-14']} seed={checking({ phase: 'failed', failure: 'timeout' })} />
      <LiveFrame label="Cancellation requested — Stopping…" ids={['SPH-13']} seed={checking({ phase: 'stopping' })} />
      <LiveFrame label="Cancelled — draft kept, deliberate continuation" ids={['SPH-13']} seed={checking({ phase: 'cancelled' })} />
      <LiveFrame label="Offline — draft kept" ids={['SPH-14']} scenario={{ network: 'offline' }} seed={checking({ phase: 'failed', failure: 'offline' })} />
      <LiveFrame label="Capacity pressure — retryable, free action available" ids={['SPH-14']} scenario={{ capacity: 'busy' }} seed={{ state: activeState(ex.friend, { draft: DRAFT }) }} />
      <LiveFrame label="Late result fenced after restart" ids={['SPH-13']} seed={{ state: activeState(ex.house, { fencedNotice: true }) }} />
    </StateSection>
  )
}

