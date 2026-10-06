import React from 'react'
import { StateSection } from '../states/StateFrame'
import { LiveFrame } from './LiveFrame'
import { activeState, compared, ex, fromTemplate, item } from '../../utils/gallerySeeds'
import type { PracticeExercise, ReferenceState } from '../../types/practice'
import type { RoundState } from '../../hooks/usePracticeRound'

function shown(exercise: PracticeExercise, draft: string, patch: Partial<RoundState> = {}): Partial<RoundState> {
  const comparison = compared(draft, exercise.reference)
  const reference: ReferenceState = { phase: 'shown', comparison, failure: null }
  return {
    ...activeState(exercise, { draft, reference, ...patch }),
    items: [item(exercise, { reviewed: true, comparison, finalDraft: draft })],
  }
}

export function GroupFree() {
  const coffee = fromTemplate(0)
  return (
    <StateSection
      id="sph-d"
      title="D · Free reference comparison"
      description="Checks a normalized match to ONE saved translation — ignoring case, extra spaces, punctuation, apostrophe style and equivalent Unicode spelling. Accents, letters and word order still count. Two honest outcomes, never a score or a semantic verdict. Both strings are shown exactly as written."
    >
      <LiveFrame label="Reference hidden — free action explained" ids={['SPH-07', 'SPH-08']} seed={{ state: activeState(ex.arrive, { draft: 'j\'arrive   demain' }) }} />
      <LiveFrame label="Revealing the reference" ids={['SPH-07', 'SPH-13']} seed={{ state: activeState(ex.arrive, { draft: 'j\'arrive   demain', reference: { phase: 'pending', comparison: null, failure: null } }) }} />
      <LiveFrame
        label="Matches after normalization — “j'arrive   demain” vs “J’arrive demain.”"
        ids={['SPH-07']}
        note="Case, spacing, final punctuation and apostrophe style are ignored. Both originals stay untouched."
        seed={{ state: shown(ex.arrive, 'j\'arrive   demain') }}
      />
      <LiveFrame label="Different — word order" ids={['SPH-07']} seed={{ state: shown(ex.arrive, 'Demain j’arrive.') }} />
      <LiveFrame label="Different — accent (cafe vs café)" ids={['SPH-07']} seed={{ state: shown(coffee, 'Je bois un cafe en chemin vers le travail.') }} />
      <LiveFrame label="Different — valid alternative phrasing" ids={['SPH-07']} note="Neutral info treatment — not a failure." seed={{ state: shown(ex.friend, 'Aujourd’hui, après le travail, je rends visite à un ami.') }} />
      <LiveFrame label="Empty draft — reference only, no verdict" ids={['SPH-07']} seed={{ state: shown(ex.friend, '') }} />
      <LiveFrame
        label="Hidden again — still recorded once"
        ids={['SPH-08']}
        seed={{ state: { ...shown(ex.arrive, 'J’arrive demain.'), reference: { phase: 'collapsed', comparison: compared('J’arrive demain.', ex.arrive.reference), failure: null } } }}
      />
      <LiveFrame
        label="Reveal failed — reference stays hidden"
        ids={['SPH-08', 'SPH-14']}
        seed={{ state: activeState(ex.arrive, { draft: 'J’arrive demain', reference: { phase: 'failed', comparison: null, failure: 'offline' } }) }}
      />
      <LiveFrame
        label="Uncertain reveal — Get result, no duplicate review"
        ids={['SPH-08', 'SPH-13']}
        seed={{ state: activeState(ex.arrive, { draft: 'J’arrive demain', reference: { phase: 'failed', comparison: null, failure: 'uncertain' } }) }}
      />
      <LiveFrame
        label="Zero credits, saved example — free actions usable"
        ids={['SPH-08']}
        scenario={{ credits: 'zero' }}
        seed={{ state: activeState(ex.friend, { draft: 'Je rends visite à un ami après le travail.', revealedHints: ['h-ami'] }) }}
      />
      <LiveFrame
        label="AI model unavailable — free action still usable"
        ids={['SPH-08', 'SPH-17']}
        scenario={{ model: 'unavailable' }}
        seed={{ state: activeState(ex.friend, { draft: 'Je rends visite à un ami.' }) }}
      />
      <LiveFrame
        label="Zero credits, no saved example — nothing free to fabricate"
        ids={['SPH-02', 'SPH-08']}
        scenario={{ credits: 'zero', savedPool: 'empty' }}
        height={460}
        note="Live: the round tries to prepare a sentence and stops honestly."
      />
    </StateSection>
  )
}

