import React, { useEffect, useMemo, useState } from 'react'
import { ArrowRightIcon, LogInIcon, MaximizeIcon } from 'lucide-react'
import { Button } from '../Button'
import { Select } from '../Select'
import { Radio, RadioGroup } from '../Radio'
import { InlineAlert } from '../InlineAlert'
import { Skeleton } from '../Skeleton'
import { ResponsiveSheet } from '../card/ResponsiveSheet'
import { SetupScope, ROUND_WORD_CAP } from './SetupScope'
import { SetupMode } from './SetupMode'
import { usePractice } from '../../contexts/PracticeContext'
import type { Dictionary, LanguageCode, VocabCard } from '../../types/dictionary'
import type { PracticeConfig, PracticeDirection, PracticeMode, Presentation, ViewerRole } from '../../types/practice'
import { languageName } from '../../data/languages'
import { EXPLANATION_LANGUAGES } from '../../utils/practiceGrading'

export type SetupForcedState = 'loading' | 'failed' | 'unavailable' | 'anonymous'

export interface PracticeSetupProps {
  dictionary: Dictionary
  entries: VocabCard[]
  viewer: ViewerRole
  frame: 'sheet' | 'inline'
  open?: boolean
  onClose: () => void
  onStart: (config: PracticeConfig, presentation: Presentation) => void
  onSignIn: () => void
  forceState?: SetupForcedState
  initialDirection?: PracticeDirection
  initialMode?: PracticeMode
  initialScope?: 'batch' | 'manual'
  initialSelected?: string[]
  initialQuery?: string
}

export function PracticeSetup(props: PracticeSetupProps) {
  const { frame, open = true, onClose, dictionary } = props
  const { body, footer } = useSetupContent(props)
  if (frame === 'inline') {
    return (
      <div className="overflow-hidden rounded-2xl border border-border-default bg-background-surface">
        <div className="border-b border-border-default px-4 py-3">
          <h2 className="text-base font-semibold text-text-primary">Sentence practice</h2>
          <p className="text-sm text-text-secondary">{dictionary.name}</p>
        </div>
        <div className="overflow-y-auto px-4 py-4" style={{ maxHeight: '38rem' }}>{body}</div>
        {footer ? <div className="border-t border-border-default px-4 py-3">{footer}</div> : null}
      </div>
    )
  }
  return (
    <ResponsiveSheet open={open} onClose={onClose} size="md" title="Sentence practice" description={dictionary.name} footer={footer}>
      {body}
    </ResponsiveSheet>
  )
}

function useSetupContent({
  dictionary,
  entries,
  viewer,
  onClose,
  onStart,
  onSignIn,
  forceState,
  initialDirection = 'reverse',
  initialMode = 'saved-first',
  initialScope = 'batch',
  initialSelected = [],
  initialQuery,
}: PracticeSetupProps) {
  const { scenario, savedPoolFor, attempts, manualReviews, lifetimeSeen } = usePractice()
  const [phase, setPhase] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [attempt, setAttempt] = useState(0)
  const [direction, setDirection] = useState<PracticeDirection>(initialDirection)
  const [explanation, setExplanation] = useState<LanguageCode>(dictionary.sourceLanguage)
  const [scope, setScope] = useState<'batch' | 'manual'>(initialScope)
  const [selected, setSelected] = useState<string[]>(initialSelected)
  const [mode, setMode] = useState<PracticeMode>(initialMode)
  const [refreshing, setRefreshing] = useState(false)

  const eligible = useMemo(
    () => entries.filter((e) => e.status === 'active' && e.source.trim() && e.translation.trim()).sort((a, b) => a.order - b.order),
    [entries],
  )
  const skipped = entries.filter((e) => e.status === 'active' && !eligible.includes(e))

  useEffect(() => {
    if (forceState) return undefined
    setPhase('loading')
    const timer = window.setTimeout(() => setPhase(scenario.preparation === 'fail' || scenario.network === 'offline' ? 'failed' : 'ready'), 650)
    return () => window.clearTimeout(timer)
  }, [attempt, forceState, scenario.network, scenario.preparation])

  useEffect(() => {
    if (phase !== 'ready') return undefined
    setRefreshing(true)
    const timer = window.setTimeout(() => setRefreshing(false), 400)
    return () => window.clearTimeout(timer)
  }, [direction, scope, selected.length, phase])

  const entryIds = scope === 'batch' ? eligible.slice(0, ROUND_WORD_CAP).map((e) => e.id) : selected
  const sentenceLanguage = direction === 'forward' ? dictionary.sourceLanguage : dictionary.targetLanguage
  const answerLanguage = direction === 'forward' ? dictionary.targetLanguage : dictionary.sourceLanguage
  const label = (dir: PracticeDirection) =>
    dir === 'forward'
      ? `${languageName(dictionary.sourceLanguage)} → ${languageName(dictionary.targetLanguage)}`
      : `${languageName(dictionary.targetLanguage)} → ${languageName(dictionary.sourceLanguage)}`

  const saved = savedPoolFor(dictionary.id).filter((ex) => {
    const req = ex.hints.filter((h) => h.role === 'required').map((h) => h.entryId!)
    return ex.direction === direction && ex.status === 'current' && req.length > 0 && req.every((id) => entryIds.includes(id))
  })
  const practisedBefore = attempts.some((a) => a.dictionaryId === dictionary.id) || manualReviews.some((r) => r.dictionaryId === dictionary.id)
  const lifetimeHere = eligible.filter((e) => lifetimeSeen.includes(e.id)).length

  const state =
    forceState ??
    (viewer === 'anonymous' ? 'anonymous' : scenario.feature === 'disabled' ? 'unavailable' : phase === 'ready' ? (eligible.length ? 'ready' : 'none') : phase)

  const back = <Button variant="secondary" onClick={onClose}>Back to dictionary</Button>

  if (state === 'anonymous') {
    return {
      body: (
        <div className="space-y-3 text-center">
          <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary-subtle text-primary-default"><LogInIcon aria-hidden className="h-5 w-5" /></span>
          <h3 className="text-base font-semibold text-text-primary">Sign in to practise sentences</h3>
          <p className="mx-auto max-w-sm text-sm text-text-secondary">
            Your answers, reviews and progress are personal, so practice needs an account. After signing in you’ll come straight back to “{dictionary.name}”.
          </p>
        </div>
      ),
      footer: <div className="flex flex-wrap justify-end gap-2">{back}<Button leadingIcon={<LogInIcon aria-hidden className="h-4 w-4" />} onClick={onSignIn}>Sign in</Button></div>,
    }
  }
  if (state === 'unavailable') {
    return {
      body: <InlineAlert tone="info" title="Sentence practice isn’t available right now">It’s turned off or temporarily unavailable. Your cards and other learning tools are unaffected.</InlineAlert>,
      footer: <div className="flex justify-end">{back}</div>,
    }
  }
  if (state === 'loading') {
    return {
      body: (
        <div role="status" aria-label="Preparing sentence practice" className="space-y-4">
          <Skeleton variant="rect" width="10rem" height="1.25rem" />
          <Skeleton variant="rect" width="100%" height="2.75rem" />
          <Skeleton variant="rect" width="100%" height="6rem" />
          <Skeleton variant="rect" width="100%" height="5rem" />
        </div>
      ),
      footer: <div className="flex justify-end"><Button disabled>Start in full screen</Button></div>,
    }
  }
  if (state === 'failed') {
    return {
      body: (
        <InlineAlert tone="error" title="Practice couldn’t be prepared" actions={<Button size="compact" variant="secondary" onClick={() => setAttempt((n) => n + 1)}>Try again</Button>}>
          We couldn’t load your saved examples and vocabulary. Nothing was changed.
        </InlineAlert>
      ),
      footer: <div className="flex justify-end">{back}</div>,
    }
  }
  if (state === 'none') {
    return {
      body: (
        <InlineAlert tone="info" title="No words can be practised yet">
          Sentence practice needs entries with both a word and a translation.{' '}
          {skipped.length ? `${skipped.length} ${skipped.length === 1 ? 'entry is' : 'entries are'} missing a translation.` : 'Add a few cards first.'}
        </InlineAlert>
      ),
      footer: <div className="flex justify-end">{back}</div>,
    }
  }

  const zero = entryIds.length === 0
  const noFree = scenario.credits === 'zero' && saved.length === 0

  const body = (
    <div className="space-y-5">
      <RadioGroup size="sm" label="Direction" value={direction} onChange={(v) => setDirection(v as PracticeDirection)}>
        <Radio value="reverse" description={`Read ${languageName(dictionary.targetLanguage)}, answer in ${languageName(dictionary.sourceLanguage)}.`}>{label('reverse')}</Radio>
        <Radio value="forward" description={`Read ${languageName(dictionary.sourceLanguage)}, answer in ${languageName(dictionary.targetLanguage)}.`}>{label('forward')}</Radio>
      </RadioGroup>

      <Select
        fullWidth
        label="Explanation language"
        hint={`Defaults to ${languageName(dictionary.sourceLanguage)}, whichever direction you choose.`}
        value={explanation}
        options={EXPLANATION_LANGUAGES.map((code) => ({ label: languageName(code), value: code }))}
        onChange={(event) => setExplanation(event.target.value as LanguageCode)}
      />

      <div className="border-t border-border-default pt-4">
        <SetupScope
          dictionary={dictionary}
          eligible={eligible}
          skipped={skipped}
          scope={scope}
          onScopeChange={setScope}
          selected={selected}
          onSelectedChange={setSelected}
          initialQuery={initialQuery}
        />
      </div>

      <div className="border-t border-border-default pt-4">
        <SetupMode mode={mode} onModeChange={setMode} savedCount={saved.length} practisedBefore={practisedBefore} refreshing={refreshing} directionLabel={label(direction)} />
      </div>

      <div className="space-y-1 rounded-xl border border-border-default bg-background-subtle p-3 text-xs text-text-secondary">
        <p><span className="font-medium text-text-primary">Free:</span> saved examples, hints and the reference comparison for saved examples.</p>
        <p><span className="font-medium text-text-primary">May need AI credits:</span> new sentences and checking your answer with AI.</p>
        {noFree ? <p className="pt-1 font-medium text-warning-default">You have no AI credits and there are no saved examples for this setup, so there’s nothing free to practise here yet.</p> : null}
        {scenario.credits === 'zero' && saved.length > 0 ? <p className="pt-1 font-medium text-text-primary">No AI credits: you can still practise {saved.length} saved {saved.length === 1 ? 'example' : 'examples'} for free.</p> : null}
        <p className="pt-1">Each round ends once every selected word has appeared. Overall, you’ve seen {lifetimeHere} of {eligible.length} words in this dictionary.</p>
      </div>
    </div>
  )

  const start = (presentation: Presentation) =>
    onStart({ dictionaryId: dictionary.id, direction, sentenceLanguage, answerLanguage, explanationLanguage: explanation, mode, entryIds, scope }, presentation)

  const footer = (
    <div className="space-y-2">
      {zero ? <p id="practice-start-reason" className="text-xs text-danger-default">Select at least one word to start.</p> : null}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button variant="secondary" disabled={zero} aria-describedby={zero ? 'practice-start-reason' : undefined} onClick={() => start('dialog')}>
          Start in window
        </Button>
        <Button
          leadingIcon={<MaximizeIcon aria-hidden className="h-4 w-4" />}
          trailingIcon={<ArrowRightIcon aria-hidden className="h-4 w-4 rtl:rotate-180" />}
          disabled={zero}
          aria-describedby={zero ? 'practice-start-reason' : undefined}
          onClick={() => start('fullscreen')}
        >
          Start in full screen
        </Button>
      </div>
    </div>
  )
  return { body, footer }
}

