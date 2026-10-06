import React from 'react'
import { StateSection } from '../states/StateFrame'
import { LiveFrame } from './LiveFrame'
import { activeState, attempt, compared, ex, item, job } from '../../utils/gallerySeeds'
import { answerValidation } from '../../utils/codePoints'
import { withLongFeedback } from '../../utils/practiceGrading'
import type { AiAttempt } from '../../types/practice'

const READY = 'Je rends visite à un ami après le travail aujourd’hui.'
const LONG = 'Je rends visite à un ami après le travail aujourd’hui. '.repeat(76)

function withResult(a: AiAttempt) {
  return {
    ...activeState(ex.friend, { draft: a.submittedAnswer, submitted: a.submittedAnswer, revealedHints: ['h-ami'] }),
    items: [item(ex.friend, { attempts: [a], finalDraft: a.submittedAnswer })],
  }
}

export function GroupDraft() {
  const perfect = attempt(ex.friend, READY)
  const low = attempt(ex.friend, 'Hier elle dort à la maison!')
  const missing = attempt(ex.friend, 'Aujourd’hui je rends visite à un copain après le boulot.')
  const spanless = attempt(ex.friend, 'Je rends visite à un ami après le travail aujourd’hui')
  const long = withLongFeedback(attempt(ex.friend, 'Aujourd’hui je visite un ami aprés le travial', false, 'en'))
  const assisted = attempt(ex.friend, READY, true)

  return (
    <StateSection
      id="sph-c"
      title="C · Draft and AI check"
      description="The learner’s exact text is never normalized or replaced. While a check runs the field is read-only and the feedback attaches to that exact submitted text. Check with AI is the primary action; the free comparison sits next to the answer and looks different."
    >
      <LiveFrame label="Empty draft" ids={['SPH-06']} seed={{ state: activeState(ex.friend) }} />
      <LiveFrame label="Whitespace-only → inline validation" ids={['SPH-06', 'SPH-18']} seed={{ state: activeState(ex.friend, { draft: '   ', validationError: answerValidation('   ') }) }} />
      <LiveFrame label="Typing" ids={['SPH-06']} seed={{ state: activeState(ex.friend, { draft: 'Je rends visite à un', revealedHints: ['h-visit'] }) }} />
      <LiveFrame label="Ready to check" ids={['SPH-06']} seed={{ state: activeState(ex.friend, { draft: READY }) }} />
      <LiveFrame label="Over 4,000 characters — still editable" ids={['SPH-06']} seed={{ state: activeState(ex.friend, { draft: LONG, validationError: answerValidation(LONG) }) }} />
      <LiveFrame label="Check queued — exact submitted answer locked" ids={['SPH-06', 'SPH-13']} seed={{ state: activeState(ex.friend, { draft: READY, submitted: READY }), job: job({ phase: 'queued' }) }} />
      <LiveFrame label="Check running — duplicate check disabled" ids={['SPH-06', 'SPH-13']} seed={{ state: activeState(ex.friend, { draft: READY, submitted: READY }), job: job({ phase: 'running' }) }} />
      <LiveFrame label="Perfect — 100" ids={['SPH-06']} seed={{ state: withResult(perfect) }} />
      <LiveFrame label="Low score — Practise again later" ids={['SPH-06']} seed={{ state: withResult(low) }} />
      <LiveFrame label="Synonyms instead of required words — capped at 79" ids={['SPH-06']} note="“copain”/“boulot” convey meaning but don’t replace “ami”/“travail”." seed={{ state: withResult(missing) }} />
      <LiveFrame label="Spanless issue — prevents 100" ids={['SPH-06']} seed={{ state: withResult(spanless) }} />
      <LiveFrame label="Long feedback in English" ids={['SPH-06', 'SPH-18']} height={760} seed={{ state: withResult(long) }} />
      <LiveFrame
        label="Reference viewed first — neutral label, grade unchanged"
        ids={['SPH-06', 'SPH-08']}
        seed={{ state: { ...withResult(assisted), reference: { phase: 'collapsed', comparison: compared(READY, ex.friend.reference), failure: null } } }}
      />
      <LiveFrame
        label="Check failed — exact draft preserved"
        ids={['SPH-06', 'SPH-14']}
        seed={{ state: activeState(ex.friend, { draft: READY, submitted: READY }), job: job({ phase: 'failed', failure: 'provider' }) }}
      />
    </StateSection>
  )
}

