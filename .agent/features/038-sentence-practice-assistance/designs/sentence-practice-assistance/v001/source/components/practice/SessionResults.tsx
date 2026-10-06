import React, { useState } from 'react'
import { BookOpenCheckIcon, ChevronDownIcon, ChevronUpIcon, RepeatIcon, SkipForwardIcon, SparklesIcon } from 'lucide-react'
import { Badge } from '../Badge'
import { Button } from '../Button'
import { InlineAlert } from '../InlineAlert'
import { AiResultPanel } from './AiResultPanel'
import { JobStatus } from './JobStatus'
import { PracticeNotice } from './PracticeNotice'
import type { PracticeRound } from '../../hooks/usePracticeRound'
import type { RoundItem, Rating } from '../../types/practice'
import { languageDir, languageName } from '../../data/languages'
import { ratingLabel } from '../../utils/practiceGrading'
import { sentenceText } from '../../utils/sentenceMarkup'

interface SessionResultsProps {
  round: PracticeRound
  dictionaryName: string
  lifetimeTotal: number
  onReturn: () => void
  onOpenSettings: () => void
}

const ratingOrder: Rating[] = ['perfect', 'good', 'not-bad', 'again']
const issueCopy = { outdated: 'is outdated (its dictionary entry changed)', removed: 'was deleted', revoked: 'is no longer accessible to you' }

/** Replaces the exercise inside the same practice surface — no second dialog. */
export function SessionResults({ round, dictionaryName, lifetimeTotal, onReturn, onOpenSettings }: SessionResultsProps) {
  const results = round.results
  const [showAll, setShowAll] = useState(false)
  if (!results || !round.config) return null
  const { counters, coverage, items } = results
  const final = items[items.length - 1]
  const admitting = round.fresh.phase === 'admitting'
  const onlySkipped = counters.skipped === counters.examples && counters.examples > 0

  return (
    <section aria-labelledby="results-title" className="space-y-6">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">{results.wasReplay ? 'Saved replay' : 'Practice round'}</p>
        <h2 id="results-title" tabIndex={-1} className="mt-1 text-2xl font-semibold text-text-primary">
          {results.wasReplay ? 'Replay complete' : 'Round complete'}
        </h2>
        <p className="mt-1 text-sm text-text-secondary">
          {dictionaryName} · {languageName(round.config.sentenceLanguage)} → {languageName(round.config.answerLanguage)} · explanations in{' '}
          {languageName(round.config.explanationLanguage)}
        </p>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {[
          { label: 'Examples presented', value: counters.examples },
          { label: 'Selected words seen', value: `${coverage.seen} of ${coverage.selected}` },
          { label: 'AI checks', value: counters.checks },
          { label: 'Manual reviews', value: counters.reviews },
          { label: 'Skipped', value: counters.skipped },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-border-default bg-background-surface p-3">
            <dt className="text-xs text-text-secondary">{item.label}</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums text-text-primary">{item.value}</dd>
          </div>
        ))}
      </dl>

      {counters.checks > 0 ? (
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">AI ratings this round</p>
          <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {ratingOrder.map((rating) => (
              <li key={rating} className="flex items-center justify-between gap-2 rounded-lg border border-border-default bg-background-surface px-3 py-2 text-sm">
                <span className="text-text-secondary">{ratingLabel(rating, 'en')}</span>
                <span className="font-semibold tabular-nums text-text-primary">{counters.ratings[rating]}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-sm text-text-secondary">
          {onlySkipped ? 'Every example was skipped — the round is complete but ungraded.' : 'No AI checks this round, so there’s no AI score. Manual reviews are never graded.'}
        </p>
      )}
      <p className="text-xs text-text-tertiary">
        These counts describe this round’s activity — not mastery. AI checks and manual reviews can overlap on one example and are counted separately. Across all
        your sessions you’ve seen {round.lifetime.seen} of {lifetimeTotal} words in this dictionary.
      </p>

      {final ? <FinalDetails item={final} /> : null}

      <div>
        <Button
          size="compact"
          variant="secondary"
          aria-expanded={showAll}
          onClick={() => setShowAll((prev) => !prev)}
          trailingIcon={showAll ? <ChevronUpIcon aria-hidden className="h-4 w-4" /> : <ChevronDownIcon aria-hidden className="h-4 w-4" />}
        >
          This round’s examples ({items.length})
        </Button>
        {showAll ? (
          <ol className="mt-3 space-y-2">
            {items.map((item, index) => (
              <li key={`${item.exercise.id}-${index}`} className="rounded-xl border border-border-default bg-background-surface p-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
                  <span>Example {index + 1}</span>
                  <OutcomeBadges item={item} />
                </div>
                <p lang={item.exercise.sourceLanguage} dir={languageDir(item.exercise.sourceLanguage)} className="mt-1 break-words text-sm font-medium text-text-primary">
                  {sentenceText(item.exercise.segments)}
                </p>
              </li>
            ))}
          </ol>
        ) : null}
      </div>

      {round.replayIssue ? (
        <InlineAlert tone="warning" title="This exact replay isn’t available">
          Example {round.replayIssue.position} of {results.sequence.length} {issueCopy[round.replayIssue.reason]}. Exact replay never swaps in a different example, so it can’t
          start. You can generate new examples or return to your dictionary.
        </InlineAlert>
      ) : null}

      {round.fresh.phase === 'failed' ? (
        <PracticeNotice
          failure={round.fresh.failure ?? 'cancelled'}
          context="generation"
          hasSavedExample
          onRetry={round.generateNew}
          onOpenSettings={onOpenSettings}
          onReturn={onReturn}
        />
      ) : null}
      {admitting ? <JobStatus job={round.job} onCancel={round.cancel} onResume={round.resume} /> : null}

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-border-default bg-background-surface p-4">
          <Button fullWidth leadingIcon={<RepeatIcon aria-hidden className="h-4 w-4" />} onClick={round.repeatExact} disabled={admitting || Boolean(round.replayIssue)}>
            Repeat these exact examples
          </Button>
          <p className="mt-2 text-xs text-text-secondary">
            The same {items.length} {items.length === 1 ? 'example' : 'examples'} in the same order, with fresh answers. Saved examples, hints and references are free; AI
            checks may still need credits.
          </p>
        </div>
        <div className="rounded-xl border border-border-default bg-background-surface p-4">
          <Button
            fullWidth
            variant="secondary"
            leadingIcon={<SparklesIcon aria-hidden className="h-4 w-4" />}
            onClick={round.generateNew}
            loading={admitting}
            disabled={admitting}
          >
            {admitting ? 'Preparing a sentence…' : 'Generate new examples'}
          </Button>
          <p className="mt-2 text-xs text-text-secondary">
            Fresh sentences for the same {coverage.selected} words — needs AI and may need credits. Earlier examples and your history are kept.
          </p>
        </div>
      </div>
    </section>
  )
}

function OutcomeBadges({ item }: { item: RoundItem }) {
  const last = item.attempts[item.attempts.length - 1]
  return (
    <>
      {last ? (
        <Badge size="sm" tone="info" icon={<SparklesIcon aria-hidden className="h-3 w-3" />}>
          AI {last.result.score}% · {ratingLabel(last.result.rating, last.result.explanationLanguage)}
        </Badge>
      ) : null}
      {item.reviewed ? (
        <Badge size="sm" tone="neutral" icon={<BookOpenCheckIcon aria-hidden className="h-3 w-3" />}>
          Manually reviewed
        </Badge>
      ) : null}
      {item.skipped ? (
        <Badge size="sm" tone="neutral" icon={<SkipForwardIcon aria-hidden className="h-3 w-3" />}>
          Skipped
        </Badge>
      ) : null}
    </>
  )
}

function FinalDetails({ item }: { item: RoundItem }) {
  const [open, setOpen] = useState(true)
  const last = item.attempts[item.attempts.length - 1]
  const ex = item.exercise
  return (
    <div className="rounded-xl border border-border-default bg-background-subtle p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-semibold text-text-primary">Last example</h3>
          <OutcomeBadges item={item} />
        </div>
        <Button
          size="compact"
          variant="secondary"
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
          trailingIcon={open ? <ChevronUpIcon aria-hidden className="h-4 w-4" /> : <ChevronDownIcon aria-hidden className="h-4 w-4" />}
        >
          {open ? 'Hide details' : 'Show details'}
        </Button>
      </div>
      {open ? (
        <div className="mt-3 space-y-3">
          <p lang={ex.sourceLanguage} dir={languageDir(ex.sourceLanguage)} className="break-words text-lg text-text-primary">
            {sentenceText(ex.segments)}
          </p>
          {last ? <AiResultPanel attempt={last} /> : null}
          {item.reviewed ? (
            <dl className="grid gap-3 md:grid-cols-2">
              <div className="min-w-0 rounded-lg border border-border-default bg-background-surface p-3">
                <dt className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary">Reference translation (one valid translation)</dt>
                <dd lang={ex.responseLanguage} dir={languageDir(ex.responseLanguage)} className="mt-1 break-words text-text-primary">{ex.reference}</dd>
              </div>
              <div className="min-w-0 rounded-lg border border-border-default bg-background-surface p-3">
                <dt className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary">Free comparison</dt>
                <dd className="mt-1 text-sm text-text-primary">
                  {item.comparison?.kind === 'match'
                    ? 'Matches the reference after normalization.'
                    : item.comparison?.kind === 'different'
                      ? 'Different from this reference. Another translation may still be valid.'
                      : 'Reference read without an answer.'}
                  {item.comparison && item.comparison.kind !== 'reference-only' ? (
                    <span lang={ex.responseLanguage} dir="auto" className="mt-1 block whitespace-pre-wrap break-words text-text-secondary">“{item.comparison.draft}”</span>
                  ) : null}
                </dd>
              </div>
            </dl>
          ) : null}
          {item.skipped ? (
            <p className="text-sm text-text-secondary">
              Skipped — not checked or compared, so nothing was recorded for it.
              {item.finalDraft.trim() ? (
                <span lang={ex.responseLanguage} dir="auto" className="mt-1 block whitespace-pre-wrap break-words">Unsent draft: “{item.finalDraft}”</span>
              ) : null}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

