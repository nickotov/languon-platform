import React from 'react'
import { InlineAlert } from '../InlineAlert'
import { Button } from '../Button'
import type { FailureKind, JobKind } from '../../types/practice'

export interface NoticeActions {
  onRetry?: () => void
  onCompare?: () => void
  onReviewSaved?: () => void
  onReturn?: () => void
  onOpenSettings?: () => void
  onSignIn?: () => void
  onDismiss?: () => void
  onSkip?: () => void
}

interface PracticeNoticeProps extends NoticeActions {
  failure: FailureKind | 'cancelled'
  context: JobKind | 'access'
  /** A current saved example exists, so the free comparison is still possible. */
  hasSavedExample?: boolean
}

type Copy = { title: string; body: string; tone: 'info' | 'warning' | 'error' }

function copyFor(failure: PracticeNoticeProps['failure'], context: PracticeNoticeProps['context'], hasSaved: boolean): Copy {
  const what = context === 'generation' ? 'preparing a sentence' : context === 'check' ? 'checking your answer' : 'loading'
  switch (failure) {
    case 'cancelled':
      return {
        tone: 'info',
        title: context === 'check' ? 'Check stopped' : 'Stopped',
        body: `${context === 'check' ? 'Your answer is still here.' : 'Your setup is kept.'} Work that had already started may still have used credits.`,
      }
    case 'offline':
      return { tone: 'warning', title: 'You’re offline', body: `We couldn’t reach Languon while ${what}. Your answer and progress in this session are kept. Try again when you’re back online.` }
    case 'poll':
      return { tone: 'warning', title: 'We couldn’t read the latest status', body: 'Your request wasn’t lost. Trying again reads the same request — it doesn’t start a new one.' }
    case 'capacity':
      return { tone: 'warning', title: 'AI is busy right now', body: 'This is temporary — nothing was deleted. Try again in a little while.' + (hasSaved ? ' Free reference comparison still works.' : '') }
    case 'credits':
      return {
        tone: 'info',
        title: 'No AI credits left',
        body:
          context === 'generation'
            ? hasSaved
              ? 'New sentences need credits. You can still practise saved examples with free hints and reference comparison.'
              : 'New sentences need credits, and there are no saved examples for this setup — so there’s nothing free to practise here yet.'
            : 'Checking with AI needs credits. Hints and the free reference comparison stay available.',
      }
    case 'model':
      return { tone: 'info', title: 'Your selected AI model is unavailable', body: 'Choose another AI preference for future requests, or keep practising with free hints and reference comparison.' }
    case 'malformed':
      return { tone: 'warning', title: 'The AI feedback couldn’t be read', body: 'We won’t show a made-up score. Your answer is kept — get the result again, or compare with the reference for free.' }
    case 'timeout':
      return { tone: 'warning', title: `${context === 'check' ? 'The check' : 'Preparing the sentence'} took too long`, body: 'Trying again resumes the same request. Your answer is kept.' }
    case 'provider':
      return { tone: 'error', title: `Something went wrong while ${what}`, body: 'Your answer and setup are kept. Try again, or use a free option below.' }
    case 'wrong-language':
      return { tone: 'warning', title: 'The sentence came back in the wrong language', body: 'We didn’t show it. Try preparing again.' }
    case 'reference':
      return { tone: 'warning', title: 'The reference couldn’t be shown', body: 'It stays hidden and nothing was recorded.' }
    case 'outdated':
      return { tone: 'info', title: 'This example is outdated', body: 'Its dictionary entry changed, so it can’t be checked or compared any more. Skip to continue.' }
    case 'removed':
      return { tone: 'error', title: 'This content was deleted', body: 'It’s no longer available, so it has been removed from this screen.' }
    case 'revoked':
      return { tone: 'error', title: 'You no longer have access to this dictionary', body: 'The owner stopped sharing it. Practice content has been removed from this screen.' }
    case 'archived':
      return { tone: 'error', title: 'This dictionary was archived', body: 'Practice isn’t available for archived dictionaries. Content has been removed from this screen.' }
    case 'session':
      return { tone: 'error', title: 'You’ve been signed out', body: 'Sign in again to continue. For your privacy, practice content has been cleared from this screen.' }
    default:
      return { tone: 'error', title: 'Something went wrong', body: 'Please try again.' }
  }
}

export function PracticeNotice({ failure, context, hasSavedExample = false, ...actions }: PracticeNoticeProps) {
  const copy = copyFor(failure, context, hasSavedExample)
  const resumable = ['offline', 'poll', 'timeout', 'provider', 'malformed', 'capacity', 'wrong-language', 'cancelled'].includes(failure)
  const retryLabel =
    failure === 'malformed' || failure === 'poll'
      ? 'Get the result again'
      : failure === 'cancelled'
        ? context === 'check'
          ? 'Check again'
          : 'Prepare a sentence'
        : 'Try again'

  const buttons: React.ReactNode[] = []
  if (resumable && actions.onRetry) buttons.push(<Button key="retry" size="compact" variant="secondary" onClick={actions.onRetry}>{retryLabel}</Button>)
  if (actions.onCompare) buttons.push(<Button key="compare" size="compact" variant="secondary" onClick={actions.onCompare}>Compare with reference — free</Button>)
  if ((failure === 'credits' || failure === 'capacity' || failure === 'model' || failure === 'provider') && actions.onReviewSaved && hasSavedExample)
    buttons.push(<Button key="saved" size="compact" variant="secondary" onClick={actions.onReviewSaved}>Review saved examples</Button>)
  if (failure === 'model' && actions.onOpenSettings) buttons.push(<Button key="settings" size="compact" variant="secondary" onClick={actions.onOpenSettings}>AI settings</Button>)
  if (failure === 'outdated' && actions.onSkip) buttons.push(<Button key="skip" size="compact" variant="secondary" onClick={actions.onSkip}>Skip this example</Button>)
  if (failure === 'session' && actions.onSignIn) buttons.push(<Button key="signin" size="compact" onClick={actions.onSignIn}>Sign in</Button>)
  if (actions.onReturn) buttons.push(<Button key="return" size="compact" variant="secondary" onClick={actions.onReturn}>Back to dictionary</Button>)

  return (
    <InlineAlert tone={copy.tone} title={copy.title} onDismiss={actions.onDismiss} actions={buttons.length ? <div className="flex flex-wrap gap-2">{buttons}</div> : undefined}>
      {copy.body}
    </InlineAlert>
  )
}

