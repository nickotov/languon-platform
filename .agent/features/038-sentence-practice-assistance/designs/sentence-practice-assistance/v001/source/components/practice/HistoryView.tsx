import React, { useEffect, useState } from 'react'
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

const PAGE_SIZE = 4

export interface HistoryViewProps {
  dictionaryId: string
  initialTab?: 'ai' | 'manual'
  /** Gallery overrides. */
  forceLoading?: boolean
  forceLoadingMore?: boolean
  forcePageError?: boolean
  forceEmpty?: boolean
}

/** Personal results only — never another learner’s answers, even on a shared dictionary. */
export function HistoryView({ dictionaryId, initialTab = 'ai', forceLoading, forceLoadingMore, forcePageError, forceEmpty }: HistoryViewProps) {
  const { attempts, manualReviews, scenario } = usePractice()
  const [tab, setTab] = useState<'ai' | 'manual'>(initialTab)
  const [loading, setLoading] = useState(true)
  const [visible, setVisible] = useState(PAGE_SIZE)
  const [loadingMore, setLoadingMore] = useState(false)
  const [pageError, setPageError] = useState(false)

  useEffect(() => {
    const timer = window.setTimeout(() => setLoading(false), 700)
    return () => window.clearTimeout(timer)
  }, [])

  const ai = forceEmpty ? [] : attempts.filter((a) => a.dictionaryId === dictionaryId && a.exerciseStatus !== 'removed')
  const manual = forceEmpty ? [] : manualReviews.filter((r) => r.dictionaryId === dictionaryId && r.exerciseStatus !== 'removed')
  const rows = tab === 'ai' ? ai : manual
  const shown = rows.slice(0, visible)

  const loadMore = () => {
    setLoadingMore(true)
    setPageError(false)
    window.setTimeout(() => {
      setLoadingMore(false)
      if (scenario.historyPage === 'fail' || scenario.network === 'offline') setPageError(true)
      else setVisible((prev) => prev + PAGE_SIZE)
    }, 800)
  }

  const isLoading = forceLoading ?? loading

  return (
    <section aria-labelledby="history-title" className="space-y-4">
      <div>
        <h2 id="history-title" tabIndex={-1} className="text-xl font-semibold text-text-primary">My practice history</h2>
        <p className="mt-1 text-sm text-text-secondary">Only your own results. Outdated examples stay readable but can’t be checked or compared again.</p>
      </div>
      <SegmentedTabs
        label="History type"
        value={tab}
        onValueChange={(value) => {
          setTab(value as 'ai' | 'manual')
          setVisible(PAGE_SIZE)
          setPageError(false)
        }}
        items={[
          { value: 'ai', label: 'AI checks', count: isLoading ? undefined : ai.length },
          { value: 'manual', label: 'Manual reviews', count: isLoading ? undefined : manual.length },
        ]}
      />

      {isLoading ? (
        <div role="status" aria-label="Loading personal results" className="space-y-2">
          <p className="text-sm text-text-secondary">Loading personal results…</p>
          <Skeleton variant="rect" width="100%" height="4.5rem" />
          <Skeleton variant="rect" width="100%" height="4.5rem" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-border-default p-6 text-center">
          <p className="text-sm font-medium text-text-primary">{tab === 'ai' ? 'No AI checks yet' : 'No manual reviews yet'}</p>
          <p className="mt-1 text-sm text-text-secondary">
            {tab === 'ai' ? 'Results appear here after you check an answer with AI.' : 'Examples appear here after you compare with the reference.'}
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {tab === 'ai'
            ? (shown as AiAttempt[]).map((attempt) => <AiRow key={attempt.id} attempt={attempt} />)
            : (shown as ManualReview[]).map((review) => <ManualRow key={review.id} review={review} />)}
        </ul>
      )}

      {loadingMore || forceLoadingMore ? (
        <div role="status" aria-label="Loading more results" className="space-y-2">
          <Skeleton variant="rect" width="100%" height="4rem" />
        </div>
      ) : null}
      {pageError || forcePageError ? (
        <InlineAlert tone="error" title="More results couldn’t load" actions={<Button size="compact" variant="secondary" onClick={loadMore}>Try again</Button>}>
          The results already shown are kept.
        </InlineAlert>
      ) : null}
      {!isLoading && rows.length > visible && !loadingMore && !pageError && !forcePageError && !forceLoadingMore ? (
        <Button variant="secondary" fullWidth onClick={loadMore}>Load more</Button>
      ) : null}
    </section>
  )
}

const stamp = (value: string) => format(new Date(value), 'd MMM yyyy, HH:mm')

function Outdated() {
  return (
    <Badge size="sm" tone="warning" icon={<InfoIcon aria-hidden className="h-3.5 w-3.5" />}>
      Outdated · read-only
    </Badge>
  )
}

function AiRow({ attempt }: { attempt: AiAttempt }) {
  const [open, setOpen] = useState(false)
  return (
    <li className="rounded-xl border border-border-default bg-background-surface p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
        <time dateTime={attempt.createdAt}>{stamp(attempt.createdAt)}</time>
        <span className="inline-flex items-center gap-1">
          {languageName(attempt.sourceLanguage)}
          <ArrowRightIcon aria-hidden className="h-3 w-3 rtl:rotate-180" />
          <span className="sr-only">to</span>
          {languageName(attempt.responseLanguage)}
        </span>
        {attempt.exerciseStatus === 'outdated' ? <Outdated /> : null}
      </div>
      <p lang={attempt.sourceLanguage} dir={languageDir(attempt.sourceLanguage)} className="mt-1 break-words text-sm font-medium text-text-primary">{attempt.sentence}</p>
      <p lang={attempt.responseLanguage} dir="auto" className="mt-1 break-words text-sm text-text-secondary">
        <span className="sr-only">Your answer: </span>
        {attempt.submittedAnswer}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Badge size="sm" tone={attempt.result.score >= 80 ? 'success' : attempt.result.score >= 50 ? 'warning' : 'neutral'}>
          {attempt.result.score}% · {ratingLabel(attempt.result.rating, attempt.result.explanationLanguage)}
        </Badge>
        {attempt.assisted ? <Badge size="sm" tone="neutral">Reference viewed first</Badge> : null}
        <Button
          size="compact"
          variant="secondary"
          className="ms-auto"
          aria-expanded={open}
          onClick={() => setOpen((prev) => !prev)}
          trailingIcon={open ? <ChevronUpIcon aria-hidden className="h-4 w-4" /> : <ChevronDownIcon aria-hidden className="h-4 w-4" />}
        >
          {open ? 'Hide feedback' : 'Feedback'}
        </Button>
      </div>
      {open ? <div className="mt-3"><AiResultPanel attempt={attempt} compact defaultExpanded /></div> : null}
    </li>
  )
}

function ManualRow({ review }: { review: ManualReview }) {
  return (
    <li className="rounded-xl border border-dashed border-border-strong bg-background-subtle p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
        <time dateTime={review.createdAt}>{stamp(review.createdAt)}</time>
        <Badge size="sm" tone="neutral" icon={<BookOpenCheckIcon aria-hidden className="h-3.5 w-3.5" />}>Manually reviewed</Badge>
        {review.exerciseStatus === 'outdated' ? <Outdated /> : null}
      </div>
      <p lang={review.sourceLanguage} dir={languageDir(review.sourceLanguage)} className="mt-1 break-words text-sm font-medium text-text-primary">{review.sentence}</p>
      <p className="mt-2 text-[11px] font-medium uppercase tracking-wide text-text-tertiary">Reference translation · {languageName(review.responseLanguage)}</p>
      <p lang={review.responseLanguage} dir={languageDir(review.responseLanguage)} className="mt-0.5 break-words text-sm text-text-primary">{review.reference}</p>
    </li>
  )
}

