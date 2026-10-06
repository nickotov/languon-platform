import React from 'react'
import { StateFrame, StateSection } from '../states/StateFrame'
import { PracticeSetup, type PracticeSetupProps } from '../practice/PracticeSetup'
import { LiveFrame } from './LiveFrame'
import { useApp } from '../../contexts/AppContext'
import type { VocabCard } from '../../types/dictionary'
import { SHARED_OWNER_NAME } from '../../data/practiceSeeds'

const noop = () => undefined

/** A large synthetic dictionary to show the 100-word batch rule and Load more. */
function bigDictionary(base: VocabCard[]): VocabCard[] {
  const words = ['chat', 'chien', 'livre', 'fenêtre', 'porte', 'jardin', 'soleil', 'lune', 'mer', 'montagne', 'rivière', 'pont', 'route', 'ville', 'village', 'marché', 'pain', 'fromage', 'pomme', 'poire']
  const extra = Array.from({ length: 131 }, (_, index) => ({
    ...base[0],
    id: `big-${index}`,
    source: `${words[index % words.length]}${index >= words.length ? ` ${Math.floor(index / words.length) + 1}` : ''}`,
    translation: `перевод ${index + 1}`,
    order: 20 + index,
  }))
  return [...base, ...extra]
}

export function GroupSetup() {
  const { getDictionary, cardsFor } = useApp()
  const dictionary = getDictionary('dict-fr-ru')
  if (!dictionary) return null
  const entries = cardsFor(dictionary.id)
  const big = bigDictionary(entries)
  const shared = { ...dictionary, name: `${dictionary.name} — shared by ${SHARED_OWNER_NAME}` }

  const setup = (extra: Partial<PracticeSetupProps> = {}) => (
    <PracticeSetup frame="inline" dictionary={dictionary} entries={entries} viewer="owner" onClose={noop} onStart={noop} onSignIn={noop} {...extra} />
  )

  return (
    <StateSection
      id="sph-a"
      title="A · Setup"
      description="Direction labelled by language name (default: familiar Russian → learning French), explanation language, a dictionary batch of the first 100 eligible words or a manual choice (also ≤ 100), and the existing modes. Saved first is the default and never silently switches to generation."
    >
      <StateFrame label="Initial loading" ids={['SPH-02', 'SPH-13']}>{setup({ forceState: 'loading' })}</StateFrame>
      <StateFrame label="Retryable preparation failure" ids={['SPH-02', 'SPH-14']}>{setup({ forceState: 'failed' })}</StateFrame>
      <StateFrame label="Default direction: Russian → French" ids={['SPH-02']}>{setup()}</StateFrame>
      <StateFrame label="Other direction: French → Russian" ids={['SPH-02']}>{setup({ initialDirection: 'forward' })}</StateFrame>
      <StateFrame label="Dictionary batch — first 100 of 140 eligible words" ids={['SPH-02']}>{setup({ entries: big })}</StateFrame>
      <StateFrame label="Choose entries — search and Load more" ids={['SPH-02']} note="Load more reveals 20 at a time; search filters the whole dictionary.">
        {setup({ entries: big, initialScope: 'manual', initialSelected: ['card-fr-ami', 'card-fr-travail'] })}
      </StateFrame>
      <StateFrame label="100-word cap reached" ids={['SPH-02']}>
        {setup({ entries: big, initialScope: 'manual', initialSelected: big.filter((e) => e.translation).slice(0, 100).map((e) => e.id) })}
      </StateFrame>
      <StateFrame label="Empty selection — Start disabled with reason" ids={['SPH-02']}>{setup({ initialScope: 'manual', initialSelected: [] })}</StateFrame>
      <StateFrame label="Incomplete entries only — zero eligible" ids={['SPH-02']}>{setup({ entries: entries.filter((e) => !e.translation) })}</StateFrame>
      <StateFrame label="Anonymous shared reader — sign in, return here" ids={['SPH-02', 'SPH-15']}>
        {setup({ dictionary: shared, viewer: 'anonymous', forceState: 'anonymous' })}
      </StateFrame>
      <LiveFrame
        label="Saved first, later session — reusing a checked example"
        ids={['SPH-02']}
        note="Live round. “Сегодня я навещаю друга…” was checked in earlier sessions and is reused before any generation."
      />
      <LiveFrame label="New examples — explicit fresh generation" ids={['SPH-02', 'SPH-12']} config={{ mode: 'new' }} note="Live: watch “Preparing a sentence”. Earlier examples stay saved." />
      <LiveFrame label="Review saved — empty saved pool" ids={['SPH-02']} config={{ mode: 'review' }} scenario={{ savedPool: 'empty' }} height={420} />
      <LiveFrame label="Review saved — all visited this session" ids={['SPH-02']} config={{ mode: 'review' }} seed={{ state: { status: 'empty', emptyReason: 'review-exhausted' } }} height={420} />
    </StateSection>
  )
}

