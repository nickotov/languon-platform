import React, { useEffect, useMemo, useState } from 'react'
import { ArrowRightIcon, ChevronDownIcon, ChevronUpIcon, LogInIcon, MaximizeIcon, SearchIcon } from 'lucide-react'
import { Button } from '../Button'
import { Input } from '../Input'
import { Select } from '../Select'
import { Radio, RadioGroup } from '../Radio'
import { InlineAlert } from '../InlineAlert'
import { Skeleton } from '../Skeleton'
import { ResponsiveSheet } from '../card/ResponsiveSheet'
import { usePractice } from '../../contexts/PracticeContext'
import type { Dictionary, LanguageCode, VocabCard } from '../../types/dictionary'
import type {
  PracticeConfig,
  PracticeDirection,
  PracticeMode,
  Presentation,
  ViewerRole,
} from '../../types/practice'
import { languageName } from '../../data/languages'
import { EXPLANATION_LANGUAGES } from '../../utils/practiceGrading'

export type SetupForcedState = 'loading' | 'failed' | 'unavailable' | 'anonymous'

interface PracticeSetupProps {
  dictionary: Dictionary
  entries: VocabCard[]
  viewer: ViewerRole
  frame: 'sheet' | 'inline'
  open?: boolean
  onClose: () => void
  onStart: (config: PracticeConfig, presentation: Presentation) => void
  onSignIn: () => void
  forceState?: SetupForcedState
  /** Gallery: preselect a subset. */
  initialSubset?: string[]
  initialDirection?: PracticeDirection
  initialMode?: PracticeMode
}

export function PracticeSetup(props: PracticeSetupProps) {
  const { frame, open = true, onClose, dictionary } = props
  const state = useSetupState(props)

  if (frame === 'inline') {
    return (
      <div className="overflow-hidden rounded-2xl border border-border-default bg-background-surface">
        <div className="border-b border-border-default px-4 py-3">
          <h2 className="text-base font-semibold text-text-primary">Sentence practice</h2>
          <p className="text-sm text-text-secondary">{dictionary.name}</p>
        </div>
        <div className="overflow-y-auto px-4 py-4" style={{ maxHeight: '36rem' }}>
          {state.body}
        </div>
        {state.footer ? (
          <div className="border-t border-border-default px-4 py-3">{state.footer}</div>
        ) : null}
      </div>
    )
  }

  return (
    <ResponsiveSheet
      open={open}
      onClose={onClose}
      size="md"
      title="Sentence practice"
      description={dictionary.name}
      footer={state.footer}
    >
      {state.body}
    </ResponsiveSheet>
  )
}

function useSetupState({
  dictionary,
  entries,
  viewer,
  onClose,
  onStart,
  onSignIn,
  forceState,
  initialSubset,
  initialDirection = 'forward',
  initialMode = 'saved-first',
}: PracticeSetupProps) {
  const { scenario, savedPoolFor, completedIds } = usePractice()
  const [phase, setPhase] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [direction, setDirection] = useState<PracticeDirection>(initialDirection)
  const [explanation, setExplanation] = useState<LanguageCode>(dictionary.sourceLanguage)
  const [scope, setScope] = useState<'all' | 'subset'>(initialSubset ? 'subset' : 'all')
  const [selected, setSelected] = useState<string[]>(initialSubset ?? [])
  const [query, setQuery] = useState('')
  const [mode, setMode] = useState<PracticeMode>(initialMode)
  const [showSkipped, setShowSkipped] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [attempt, setAttempt] = useState(0)

  const eligible = entries.filter((entry) => entry.status === 'active' && entry.translation.trim() && entry.source.trim())
  const skipped = entries.filter((entry) => entry.status === 'active' && !eligible.includes(entry))

  useEffect(() => {
    if (forceState) return undefined
    setPhase('loading')
    const timer = window.setTimeout(() => {
      setPhase(scenario.preparation === 'fail' || scenario.network === 'offline' ? 'failed' : 'ready')
    }, 700)
    return () => window.clearTimeout(timer)
  }, [attempt, forceState, scenario.network, scenario.preparation])

  // Re-prepare saved counts when direction or scope changes.
  useEffect(() => {
    if (phase !== 'ready') return undefined
    setRefreshing(true)
    const timer = window.setTimeout(() => setRefreshing(false), 450)
    return () => window.clearTimeout(timer)
  }, [direction, scope, selected.length, phase])

  const entryIds = scope === 'all' ? eligible.map((entry) => entry.id) : selected
  const sentenceLanguage = direction === 'forward' ? dictionary.sourceLanguage : dictionary.targetLanguage
  const answerLanguage = direction === 'forward' ? dictionary.targetLanguage : dictionary.sourceLanguage

  const saved = useMemo(
    () =>
      savedPoolFor(dictionary.id).filter(
        (item) =>
          item.direction === direction &&
          item.status === 'current' &&
          item.targets.length > 0 &&
          item.targets.every((target) => entryIds.includes(target.entryId)),
      ),
    [dictionary.id, direction, entryIds, savedPoolFor],
  )
  const uncompleted = saved.filter((item) => !completedIds.includes(item.id))

  const filteredRows = eligible.filter((entry) =>
    `${entry.source} ${entry.translation}`.toLowerCase().includes(query.trim().toLowerCase()),
  )

  const effective: SetupForcedState | 'ready' | 'none-eligible' =
    forceState ??
    (viewer === 'anonymous'
      ? 'anonymous'
      : scenario.feature === 'disabled'
        ? 'unavailable'
        : phase === 'loading'
          ? 'loading'
          : phase === 'failed'
            ? 'failed'
            : eligible.length === 0
              ? 'none-eligible'
              : 'ready')

  const start = (presentation: Presentation) =>
    onStart(
      {
        dictionaryId: dictionary.id,
        direction,
        sentenceLanguage,
        answerLanguage,
        explanationLanguage: explanation,
        mode,
        entryIds,
      },
      presentation,
    )

  const backButton = (
    <Button variant="secondary" onClick={onClose}>
      Back to dictionary
    </Button>
  )

  if (effective === 'anonymous') {
    return {
      body: (
        <div className="space-y-3 text-center">
          <span className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-primary-subtle text-primary-default">
            <LogInIcon aria-hidden className="h-5 w-5" />
          </span>
          <h3 className="text-base font-semibold text-text-primary">Sign in to practise sentences</h3>
          <p className="mx-auto max-w-sm text-sm text-text-secondary">
            Sentence practice keeps your answers, reviews and progress personal, so it needs an
            account. After signing in you’ll come straight back to “{dictionary.name}”.
          </p>
        </div>
      ),
      footer: (
        <div className="flex flex-wrap justify-end gap-2">
          {backButton}
          <Button leadingIcon={<LogInIcon aria-hidden className="h-4 w-4" />} onClick={onSignIn}>
            Sign in
          </Button>
        </div>
      ),
    }
  }

  if (effective === 'unavailable') {
    return {
      body: (
        <InlineAlert tone="info" title="Sentence practice isn’t available right now">
          It’s turned off or temporarily unavailable for this dictionary. Your cards and other
          learning tools are unaffected.
        </InlineAlert>
      ),
      footer: <div className="flex justify-end">{backButton}</div>,
    }
  }

  if (effective === 'loading') {
    return {
      body: (
        <div role="status" aria-label="Preparing sentence practice" className="space-y-4">
          <Skeleton variant="rect" width="10rem" height="1.25rem" />
          <Skeleton variant="rect" width="100%" height="2.75rem" />
          <Skeleton variant="rect" width="8rem" height="1.25rem" />
          <Skeleton variant="rect" width="100%" height="6rem" />
          <Skeleton variant="rect" width="100%" height="4rem" />
        </div>
      ),
      footer: (
        <div className="flex justify-end">
          <Button disabled>Start in full screen</Button>
        </div>
      ),
    }
  }

  if (effective === 'failed') {
    return {
      body: (
        <InlineAlert
          tone="error"
          title="Practice couldn’t be prepared"
          actions={
            <Button size="compact" variant="secondary" onClick={() => setAttempt((prev) => prev + 1)}>
              Try again
            </Button>
          }
        >
          We couldn’t load your saved sentences and vocabulary. Check your connection and try
          again — nothing was changed.
        </InlineAlert>
      ),
      footer: <div className="flex justify-end">{backButton}</div>,
    }
  }

  if (effective === 'none-eligible') {
    return {
      body: (
        <InlineAlert tone="info" title="No entries can be practised yet">
          Sentence practice needs entries with both a word and a translation.{' '}
          {skipped.length > 0
            ? `${skipped.length} ${skipped.length === 1 ? 'entry is' : 'entries are'} missing a translation.`
            : 'Add a few cards first.'}
        </InlineAlert>
      ),
      footer: <div className="flex justify-end">{backButton}</div>,
    }
  }

  const zeroSelected = entryIds.length === 0
  const directionLabel = (dir: PracticeDirection) => {
    const from = dir === 'forward' ? dictionary.sourceLanguage : dictionary.targetLanguage
    const to = dir === 'forward' ? dictionary.targetLanguage : dictionary.sourceLanguage
    return `${languageName(from)} → ${languageName(to)}`
  }

  const body = (
    <div className="space-y-5">
      <RadioGroup
        size="sm"
        label="Direction"
        value={direction}
        onChange={(value) => setDirection(value as PracticeDirection)}
      >
        <Radio value="forward">{directionLabel('forward')}</Radio>
        <Radio value="reverse">{directionLabel('reverse')}</Radio>
      </RadioGroup>

      <div>
        <Select
          fullWidth
          label="Explanation language"
          value={explanation}
          options={EXPLANATION_LANGUAGES.map((code) => ({ label: languageName(code), value: code }))}
          onChange={(event) => setExplanation(event.target.value as LanguageCode)}
        />
        <p className="mt-1 text-xs text-text-secondary">
          Defaults to {languageName(dictionary.sourceLanguage)}, this dictionary’s front language —
          whichever direction you practise.
        </p>
      </div>

      <div className="space-y-3 border-t border-border-default pt-4">
        <RadioGroup
          size="sm"
          label="Vocabulary"
          value={scope}
          onChange={(value) => setScope(value as 'all' | 'subset')}
        >
          <Radio value="all">All eligible entries ({eligible.length})</Radio>
          <Radio value="subset">Choose entries</Radio>
        </RadioGroup>

        {skipped.length > 0 ? (
          <div className="text-xs text-text-secondary">
            <button
              type="button"
              aria-expanded={showSkipped}
              onClick={() => setShowSkipped((prev) => !prev)}
              className="inline-flex items-center gap-1 rounded-sm underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            >
              {skipped.length} {skipped.length === 1 ? 'entry is' : 'entries are'} skipped — no
              translation yet
              {showSkipped ? (
                <ChevronUpIcon aria-hidden className="h-3.5 w-3.5" />
              ) : (
                <ChevronDownIcon aria-hidden className="h-3.5 w-3.5" />
              )}
            </button>
            {showSkipped ? (
              <ul className="mt-1 list-disc ps-5">
                {skipped.map((entry) => (
                  <li key={entry.id} lang={dictionary.sourceLanguage}>
                    {entry.source}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        {scope === 'subset' ? (
          <div className="space-y-2 rounded-xl border border-border-default p-3">
            <Input
              type="search"
              size="sm"
              aria-label="Search vocabulary"
              placeholder="Search vocabulary"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              leadingIcon={<SearchIcon aria-hidden className="h-4 w-4" />}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-medium text-text-primary" aria-live="polite">
                {selected.length} of {eligible.length} selected
              </p>
              <div className="flex gap-2">
                <Button
                  size="compact"
                  variant="secondary"
                  onClick={() =>
                    setSelected((prev) => Array.from(new Set([...prev, ...filteredRows.map((entry) => entry.id)])))
                  }
                >
                  Select all{query ? ' shown' : ''}
                </Button>
                <Button size="compact" variant="secondary" onClick={() => setSelected([])}>
                  Clear
                </Button>
              </div>
            </div>
            <ul className="max-h-56 space-y-1 overflow-y-auto">
              {filteredRows.map((entry) => {
                const checked = selected.includes(entry.id)
                return (
                  <li key={entry.id}>
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-background-subtle">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() =>
                          setSelected((prev) =>
                            checked ? prev.filter((id) => id !== entry.id) : [...prev, entry.id],
                          )
                        }
                        className="h-4 w-4 accent-primary-default"
                      />
                      <span className="min-w-0 flex-1 break-words text-sm">
                        <span lang={dictionary.sourceLanguage} className="font-medium text-text-primary">
                          {entry.source}
                        </span>
                        <span className="text-text-tertiary"> — </span>
                        <span lang={dictionary.targetLanguage} className="text-text-secondary">
                          {entry.translation}
                        </span>
                      </span>
                    </label>
                  </li>
                )
              })}
              {filteredRows.length === 0 ? (
                <li className="px-2 py-3 text-sm text-text-secondary">No vocabulary matches “{query}”.</li>
              ) : null}
            </ul>
          </div>
        ) : null}
      </div>

      <div className="space-y-2 border-t border-border-default pt-4">
        <RadioGroup size="sm" label="Practice mode" value={mode} onChange={(value) => setMode(value as PracticeMode)}>
          <Radio
            value="saved-first"
            description="Uses saved sentences you haven’t completed, then prepares new ones."
          >
            Saved first
          </Radio>
          <Radio
            value="new-only"
            description="A fresh sentence on every Next. Earlier sentences and your progress are kept."
          >
            New only — generate new sentences
          </Radio>
          <Radio
            value="review-only"
            description="Saved sentences only, including completed ones. Never generates."
          >
            Review only
          </Radio>
        </RadioGroup>
        <p role="status" className="text-xs text-text-secondary">
          {refreshing
            ? 'Updating saved sentences for this setup…'
            : saved.length === 0
              ? `No saved sentences yet for ${directionLabel(direction)} with this vocabulary.`
              : `${saved.length} saved ${saved.length === 1 ? 'sentence' : 'sentences'} for this setup · ${uncompleted.length} not yet completed by you`}
        </p>
      </div>

      <div className="rounded-xl border border-border-default bg-background-subtle p-3 text-xs text-text-secondary">
        <p>
          <span className="font-medium text-text-primary">Free:</span> saved sentences, hints and
          reference answers for saved sentences.
        </p>
        <p className="mt-1">
          <span className="font-medium text-text-primary">May need AI credits:</span> generating
          new sentences and checking your translation with AI.
        </p>
        {scenario.credits === 'zero' ? (
          <p className="mt-2 font-medium text-warning-default">
            You have no AI credits.{' '}
            {saved.length > 0
              ? 'You can still practise saved sentences with hints and reference answers.'
              : 'There are no saved sentences here yet, so there’s nothing free to review in this setup.'}
          </p>
        ) : null}
        {saved.length === 0 && mode !== 'review-only' ? (
          <p className="mt-2">A reference answer exists only after a sentence has been generated.</p>
        ) : null}
      </div>
    </div>
  )

  const footer = (
    <div className="space-y-2">
      {zeroSelected ? (
        <p id="practice-start-reason" className="text-xs text-danger-default">
          Select at least one entry to start.
        </p>
      ) : null}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button
          variant="secondary"
          disabled={zeroSelected}
          aria-describedby={zeroSelected ? 'practice-start-reason' : undefined}
          onClick={() => start('dialog')}
        >
          Start in a dialog
        </Button>
        <Button
          leadingIcon={<MaximizeIcon aria-hidden className="h-4 w-4" />}
          disabled={zeroSelected}
          aria-describedby={zeroSelected ? 'practice-start-reason' : undefined}
          onClick={() => start('fullscreen')}
          trailingIcon={<ArrowRightIcon aria-hidden className="h-4 w-4 rtl:rotate-180" />}
        >
          Start in full screen
        </Button>
      </div>
    </div>
  )

  return { body, footer }
}

