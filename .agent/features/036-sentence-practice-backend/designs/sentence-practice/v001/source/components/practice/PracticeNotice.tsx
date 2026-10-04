import React from 'react'
import { InlineAlert } from '../InlineAlert'
import { Button } from '../Button'
import type { FailureKind } from '../../types/practice'

export interface PracticeNoticeProps {
  failure: FailureKind | 'cancelled'
  /** What the failed work was doing. */
  context: 'generation' | 'check' | 'reveal' | 'access'
  hasSavedSentences?: boolean
  onRetry?: () => void
  onRevealReference?: () => void
  onReviewSaved?: () => void
  onReturn?: () => void
  onOpenPreferences?: () => void
  onNext?: () => void
  onSignIn?: () => void
  onDismiss?: () => void
}

interface Content {
  tone: 'error' | 'warning' | 'info'
  title: string
  body: string
}

function contentFor(
  failure: PracticeNoticeProps['failure'],
  context: PracticeNoticeProps['context'],
): Content {
  switch (failure) {
    case 'credits':
      return context === 'generation'
        ? {
            tone: 'warning',
            title: 'No AI credits for a new sentence',
            body: 'Generating a sentence needs credits. A free reference answer only exists for sentences that were already generated and saved.',
          }
        : {
            tone: 'warning',
            title: 'AI checking needs credits',
            body: 'You have no AI credits left. Hints and the reference answer for this saved sentence are still free, and you can move on with Next.',
          }
    case 'model':
      return {
        tone: 'warning',
        title: 'Your selected AI model isn’t available right now',
        body: 'Saved sentences, hints and reference answers stay free. You can pick another model in AI preferences — the change applies to future requests, not work already running.',
      }
    case 'capacity':
      return {
        tone: 'warning',
        title: 'AI is busy right now',
        body: 'This is temporary and nothing was deleted. Please try again in a little while.',
      }
    case 'offline':
      return {
        tone: 'error',
        title: 'You’re offline',
        body:
          context === 'reveal'
            ? 'The reference wasn’t opened and no review was recorded. Retrying is safe — it can’t create a duplicate review.'
            : 'Your draft is kept on this screen. When you’re back online, retrying resumes the same request instead of starting a new one.',
      }
    case 'timeout':
      return {
        tone: 'error',
        title: 'This took longer than expected',
        body: 'We stopped waiting for a response. Your text and sentence are kept. Retrying resumes the same request — it is not a new charge.',
      }
    case 'provider':
      return {
        tone: 'error',
        title:
          context === 'generation' ? 'A new sentence couldn’t be prepared' : 'The check didn’t finish',
        body:
          context === 'generation'
            ? 'Your setup is kept. You can try again, review saved sentences, or go back.'
            : 'Your draft and sentence are kept exactly as they were. You can retry or look at the reference for free.',
      }
    case 'outdated':
      return {
        tone: 'warning',
        title: 'This sentence is outdated',
        body: 'An entry it uses was edited, so it can’t be checked or revealed any more. Nothing was recorded.',
      }
    case 'removed':
      return {
        tone: 'warning',
        title: 'This sentence is no longer available',
        body: 'Its source entry was permanently deleted, so the sentence and its reference were removed.',
      }
    case 'revoked':
      return {
        tone: 'error',
        title: 'You no longer have access to this dictionary',
        body: 'The owner stopped sharing it. Sentences and references from it are no longer shown.',
      }
    case 'session':
      return {
        tone: 'error',
        title: 'Your session expired',
        body: 'Sign in again to continue. Your draft stays on this screen until you leave.',
      }
    case 'archived':
      return {
        tone: 'info',
        title: 'This dictionary is archived',
        body: 'Practice is unavailable until it is restored.',
      }
    case 'cancelled':
      return {
        tone: 'info',
        title: context === 'generation' ? 'Sentence preparation stopped' : 'Check stopped',
        body: 'If the AI had already started, the request may still have used credits. Your text is kept.',
      }
    default:
      return { tone: 'error', title: 'Something went wrong', body: 'Your text is kept.' }
  }
}

export function PracticeNotice(props: PracticeNoticeProps) {
  const { failure, context } = props
  const content = contentFor(failure, context)
  const canReveal =
    context === 'check' && ['credits', 'model', 'capacity', 'provider', 'timeout', 'cancelled'].includes(failure)
  const canRetry = ['capacity', 'offline', 'timeout', 'provider', 'cancelled'].includes(failure)

  return (
    <InlineAlert
      tone={content.tone}
      title={content.title}
      actions={
        <div className="flex flex-wrap gap-2">
          {canRetry && props.onRetry ? (
            <Button size="compact" variant="secondary" onClick={props.onRetry}>
              {failure === 'cancelled' ? 'Start again' : 'Try again'}
            </Button>
          ) : null}
          {canReveal && props.onRevealReference ? (
            <Button size="compact" variant="secondary" onClick={props.onRevealReference}>
              Show reference answer — free
            </Button>
          ) : null}
          {failure === 'model' && props.onOpenPreferences ? (
            <Button size="compact" variant="secondary" onClick={props.onOpenPreferences}>
              Open AI preferences
            </Button>
          ) : null}
          {context === 'generation' && props.hasSavedSentences && props.onReviewSaved ? (
            <Button size="compact" variant="secondary" onClick={props.onReviewSaved}>
              Review saved sentences
            </Button>
          ) : null}
          {(failure === 'outdated' || failure === 'removed') && props.onNext ? (
            <Button size="compact" variant="secondary" onClick={props.onNext}>
              Next sentence
            </Button>
          ) : null}
          {failure === 'session' && props.onSignIn ? (
            <Button size="compact" onClick={props.onSignIn}>
              Sign in again
            </Button>
          ) : null}
          {props.onReturn &&
          (context === 'generation' || context === 'access' || failure === 'revoked') ? (
            <Button size="compact" variant="secondary" onClick={props.onReturn}>
              Back to dictionary
            </Button>
          ) : null}
          {props.onDismiss ? (
            <Button size="compact" variant="secondary" onClick={props.onDismiss}>
              Dismiss
            </Button>
          ) : null}
        </div>
      }
    >
      {content.body}
    </InlineAlert>
  )
}

