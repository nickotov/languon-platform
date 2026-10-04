import React, { useState } from 'react'
import { format } from 'date-fns'
import { ArrowRightIcon, BookOpenCheckIcon, ChevronDownIcon, ChevronUpIcon, InfoIcon } from 'lucide-react'
import { Badge } from '../Badge'
import { Button } from '../Button'
import { InlineAlert } from '../InlineAlert'
import { Skeleton } from '../Skeleton'
import { SegmentedTabs } from '../common/SegmentedTabs'
import { AiResultPanel } from './AiResultPanel'
import { usePractice } from '../../contexts/PracticeContext'
import type { AiAttempt, ManualReview } from '../../types/practice'
import { languageDir, languageName } from '../../data/languages'
import { ratingLabel } from '../../utils/practiceGrading'

const PAGE_SIZE = 5

export interface HistoryContentProps {
  dictionaryId: string
  /** Gallery overrides. */
  forceAttempts?: AiAttempt[]
  forceReviews?: ManualReview[]
  forceTab?: 'ai' | 'manual'
  forceLoadingMore?: boolean
  forcePageError?: boolean
}

/** Personal history only — never other learners' answers, even on a shared dictionary. */
export function HistoryContent({
  dictionaryId,
  forceAttempts,
  forceReviews,
  forceTab,
  forceLoadingMore = false,
  forcePageError = false,
}: HistoryContentProps) {
  const { attempts, manualReviews, scenario } = usePractice()
  const [tab, setTab] = useState<'ai' | 'manual'>(forceTab ?? 'ai')
  const [visible, setVisible] = useState(PAGE_SIZE)
  const [loading, setLoading] = useState(false)
  const [pageError, setPageError] = useState(false)

  const ai = (forceAttempts ?? attempts).filter(
    (attempt) => attempt.dictionaryId === dictionaryId && attempt.exerciseStatus !== 'removed',
  )
  const manual = (forceReviews ?? manualReviews).filter(
    (review) => review.dictionaryId === dictionaryId && review.exerciseStatus !== 'removed',
  )

  const rows = tab === 'ai' ? ai : manual
  const shown = rows.slice(0, visible)
  const hasMore = rows.length > visible

  const loadMore = () => {
    setLoading(true)
    setPageError(false)
    window.setTimeout(() => {
      setLoading(false)
      if (scenario.historyPage === 'fail') {
        setPageError(true)
        return
      }
      setVisible((prev) => prev + PAGE_SIZE)
    }, 800)
  }

  return (
    <div className="space-y-4">
      <SegmentedTabs
        label="History type"
        value={tab}
        onValueChange={(value) => {
          setTab(value as 'ai' | 'manual')
          setVisible(PAGE_SIZE)
          setPageError(false)
        }}
        items={[
          { value: 'ai', label: 'AI checks', count: ai.length },
          { value: 'manual', label: 'Manual reviews', count: manual.length },
        ]}
      />
      <p className="text-xs text-text-tertiary">
        Only your own results appear here. Outdated sentences stay readable but can’t be used
        again.
      </p>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-border-default p-6 text-center">
          <p className="text-sm font-medium text-text-primary">
            {tab === 'ai' ? 'No AI checks yet' : 'No manual reviews yet'}
          </p>
          <p className="mt-1 text-sm text-text-secondary">
            {tab === 'ai'
              ? 'Results appear here after you check a translation with AI.'
              : 'Sentences appear here after you choose “Show reference answer”.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {tab === 'ai'
            ? (shown as AiAttempt[]).map((attempt) => <AiRow key={attempt.id} attempt={attempt} />)
            : (shown as ManualReview[]).map((review) => <ManualRow key={review.id} review={review} />)}
        </ul>
      )}

      {loading || forceLoadingMore ? (
        <div role="status" aria-label="Loading more results" className="space-y-2">
          <Skeleton variant="rect" width="100%" height="4rem" />
          <Skeleton variant="rect" width="100%" height="4rem" />
        </div>
      ) : null}

      {pageError || forcePageError ? (
        <InlineAlert
          tone="error"
          title="More results couldn’t load"
          actions={
            <Button size="compact" variant="secondary" onClick={loadMore}>
              Try again
            </Button>
          }
        >
          The results already shown are kept.
        </InlineAlert>
      ) : null}

      {hasMore && !loading && !pageError && !forcePageError ? (
        <Button variant="secondary" fullWidth onClick={loadMore}>
          Load more
        </Button>
      ) : null}
    </div>
  )
}

function stamp(value: string) {
  return format(new Date(value), 'd MMM yyyy, HH:mm')
}

function OutdatedBadge() {
  return (
    <Badge size="sm" tone="warning" icon={<InfoIcon aria-hidden className="h-3.5 w-3.5" />}>
      Outdated · read-only
    </Badge>
  )
}

function AiRow({ attempt }: { attempt: AiAttempt }) {
  const [open, setOpen] = useState(false)
  const { result } = attempt
  return (
    <li className="rounded-xl border border-border-default bg-background-surface p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
        <time dateTime={attempt.createdAt}>{stamp(attempt.createdAt)}</time>
        <span aria-hidden>·</span>
        <span className="inline-flex items-center gap-1">
          {languageName(attempt.sourceLanguage)}
          <ArrowRightIcon aria-hidden className="h-3 w-3 rtl:rotate-180" />
          <span className="sr-only">to</span>
          {languageName(attempt.responseLanguage)}
        </span>
        {attempt.exerciseStatus === 'outdated' ? <OutdatedBadge /> : null}
      </div>
      <p
        lang={attempt.sourceLanguage}
        dir={languageDir(attempt.sourceLanguage)}
        className="mt-1 break-words text-sm font-medium text-text-primary"
      >
        {attempt.sentence}
      </p>
      <p
        lang={attempt.responseLanguage}
        dir={languageDir(attempt.responseLanguage)}
        className="mt-1 break-words text-sm text-text-secondary"
      >
        <span className="sr-only">Your answer: </span>
        {attempt.submittedAnswer}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Badge size="sm" tone={result.score >= 80 ? 'success' : result.score >= 50 ? 'warning' : 'neutral'}>
          {result.score}% · {ratingLabel(result.rating, result.explanationLanguage)}
        </Badge>
        {attempt.assisted ? (
          <Badge size="sm" tone="neutral">
            Assisted
          </Badge>
        ) : null}
        <Button
          size="compact"
          variant="secondary"
          className="ms-auto"
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
          trailingIcon={
            open ? <ChevronUpIcon aria-hidden className="h-4 w-4" /> : <ChevronDownIcon aria-hidden className="h-4 w-4" />
          }
        >
          {open ? 'Hide feedback' : 'Feedback'}
        </Button>
      </div>
      {open ? (
        <div className="mt-3">
          <AiResultPanel attempt={attempt} defaultExpanded compact />
        </div>
      ) : null}
    </li>
  )
}

function ManualRow({ review }: { review: ManualReview }) {
  return (
    <li className="rounded-xl border border-dashed border-border-strong bg-background-subtle p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
        <time dateTime={review.createdAt}>{stamp(review.createdAt)}</time>
        <Badge size="sm" tone="neutral" icon={<BookOpenCheckIcon aria-hidden className="h-3.5 w-3.5" />}>
          Manually reviewed
        </Badge>
        {review.exerciseStatus === 'outdated' ? <OutdatedBadge /> : null}
      </div>
      <p
        lang={review.sourceLanguage}
        dir={languageDir(review.sourceLanguage)}
        className="mt-1 break-words text-sm font-medium text-text-primary"
      >
        {review.sentence}
      </p>
      <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-text-tertiary">
        Reference translation · {languageName(review.responseLanguage)}
      </p>
      <p
        lang={review.responseLanguage}
        dir={languageDir(review.responseLanguage)}
        className="mt-0.5 break-words text-sm text-text-primary"
      >
        {review.reference}
      </p>
    </li>
  )
}

