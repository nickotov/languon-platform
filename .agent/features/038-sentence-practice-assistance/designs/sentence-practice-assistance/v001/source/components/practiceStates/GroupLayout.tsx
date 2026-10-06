import React from 'react'
import { StateFrame, StateSection } from '../states/StateFrame'
import { InlineAlert } from '../InlineAlert'
import { LiveFrame } from './LiveFrame'
import { activeState, compared, ex, item, job } from '../../utils/gallerySeeds'
import { arabicExercise } from '../../data/practiceFixturesLegacy'

const noop = () => undefined
const DRAFT = 'Je rends visite à un ami après le travail.'
const busyWithReference = {
  state: {
    ...activeState(ex.friend, {
      draft: DRAFT,
      submitted: DRAFT,
      revealedHints: ['h-ami', 'h-visit'],
      reference: { phase: 'shown' as const, comparison: compared(DRAFT, ex.friend.reference), failure: null },
    }),
    items: [item(ex.friend, { reviewed: true, comparison: compared(DRAFT, ex.friend.reference) })],
  },
  job: job({ phase: 'running' }),
}
const typing = { state: activeState(ex.friend, { draft: 'Je rends visite à un ami', revealedHints: ['h-visit'] }) }

export function GroupLayout() {
  return (
    <StateSection
      id="sph-h"
      title="H · Navigation, access and layout"
      description="In the product the learning surface covers the entire window (100dvw × 100dvh) in both presentations; these frames show it contained for review. Inner views replace the body behind a back arrow. Losing access clears protected content immediately."
    >
      <LiveFrame
        label="Presentation switch keeps draft, reference and running check"
        ids={['SPH-16']}
        note="Use the full-screen toggle in the header: nothing restarts and no second request starts."
        height={760}
        seed={busyWithReference}
      />
      <LiveFrame
        label="Native full screen unavailable → viewport layout"
        ids={['SPH-16']}
        presentation="fullscreen"
        seed={typing}
        notice={<InlineAlert tone="info" title="Browser full screen isn’t available" onDismiss={noop}>Practice fills this window instead. Everything works the same.</InlineAlert>}
      />
      <LiveFrame
        label="Native full screen exited — session kept"
        ids={['SPH-16']}
        presentation="fullscreen"
        seed={typing}
        notice={<InlineAlert tone="info" title="Browser full screen ended" onDismiss={noop}>Your practice continues here — nothing was reset. Use Close to end practice.</InlineAlert>}
      />
      <LiveFrame label="Inline AI settings with back arrow" ids={['SPH-17']} initialView="settings" seed={busyWithReference} />
      <LiveFrame label="Unsaved AI setting — Keep editing / Discard" ids={['SPH-17']} initialView="settings" initialSettingsValue="fast" initialGuard="settings" seed={typing} />
      <LiveFrame label="Leave guard — unsent answer and running check" ids={['SPH-16', 'SPH-13']} initialGuard="leave" seed={busyWithReference} />
      <LiveFrame label="Signed out — content cleared, sign in" ids={['SPH-15']} scenario={{ access: 'session' }} height={420} seed={typing} />
      <LiveFrame label="Share revoked — content cleared" ids={['SPH-15']} scenario={{ access: 'revoked' }} height={420} seed={busyWithReference} />
      <LiveFrame label="Content deleted" ids={['SPH-15']} scenario={{ access: 'removed' }} height={420} seed={typing} />
      <LiveFrame label="Dictionary archived" ids={['SPH-15']} scenario={{ access: 'archived' }} height={420} seed={typing} />
      <LiveFrame label="Outdated source — no check or reveal, skip to continue" ids={['SPH-15']} seed={{ state: activeState(ex.old, { draft: 'Mon ami habite à côté.' }) }} />
      <LiveFrame label="History — loading" ids={['SPH-15']} initialView="history" historyProps={{ forceLoading: true }} seed={typing} />
      <LiveFrame label="History — loaded AI checks with outdated row" ids={['SPH-15']} initialView="history" historyProps={{ forceLoading: false }} height={760} seed={typing} />
      <LiveFrame label="History — manual reviews" ids={['SPH-15']} initialView="history" historyProps={{ forceLoading: false, initialTab: 'manual' }} seed={typing} />
      <LiveFrame label="History — empty" ids={['SPH-15']} initialView="history" historyProps={{ forceLoading: false, forceEmpty: true }} height={460} seed={typing} />
      <LiveFrame label="History — page error, loaded rows kept" ids={['SPH-15']} initialView="history" historyProps={{ forceLoading: false, forcePageError: true }} height={760} seed={typing} />
      <LiveFrame label="Tablet (768px)" ids={['SPH-16']} width={768} seed={typing} />
      <LiveFrame label="Narrow 320px — approximates 200% zoom on 640px" ids={['SPH-16', 'SPH-18']} compact width={320} height={700} seed={typing} note="A responsive stress view, not a tested device claim." />
      <LiveFrame
        label="Reduced height with keyboard visible"
        ids={['SPH-16']}
        compact
        theme="dark"
        width={375}
        height={380}
        seed={typing}
        note="The shell follows the visual viewport: sentence scrolls, field and actions stay reachable."
      />
      <LiveFrame label="Dark theme — phrase hint open" ids={['SPH-18']} theme="dark" height={720} seed={{ state: activeState(ex.house, { revealedHints: ['h-maison', 'h-next'] }) }} initialOpenHint={6} />
      <LiveFrame
        label="RTL sentence with a long dictionary name"
        ids={['SPH-18']}
        dictionaryName="Arabic · travel phrases for the summer trip to Alexandria and Cairo"
        config={{ sentenceLanguage: 'ar', answerLanguage: 'en', entryIds: ['card-ar-ticket'] }}
        seed={{ state: { status: 'active', items: [item(arabicExercise)], seen: ['card-ar-ticket'], isFinal: true } }}
      />
      <StateFrame label="Keyboard, focus and reduced motion" ids={['SPH-16', 'SPH-18']}>
        <ul className="list-disc space-y-2 ps-5 text-sm text-text-secondary">
          <li>The surface is a modal dialog with focus contained; the title receives focus on open, and Close returns focus to the Learn button.</li>
          <li>Escape closes an open hint first, then leaves an inner view, then asks before leaving practice. In native full screen the browser uses Escape to exit full screen — the session is kept.</li>
          <li>Each marked word is a separate Tab stop; Enter or Space opens its hint; hover only previews.</li>
          <li>Async changes are announced briefly (e.g. “AI check finished: 82 percent, Good”) without re-reading the sentence.</li>
          <li>Under reduced motion the progress bar is static; status text still changes.</li>
          <li>Interface labels are English in this prototype; card languages carry their own lang/dir regardless of interface language.</li>
        </ul>
      </StateFrame>
    </StateSection>
  )
}

