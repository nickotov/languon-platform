import React from 'react'
import { RefreshCwIcon, ZapIcon } from 'lucide-react'
import { Button } from '../Button'
import { InlineAlert } from '../InlineAlert'
import type { JobErrorKind, JobKind } from '../../hooks/useWorkspace'

interface JobErrorAlertProps {
  kind: JobErrorKind
  during: JobKind
  onRetry: () => void
  onExtendedModel: () => void
  onEditText?: () => void
  onDismiss: () => void
}

const COPY: Record<JobErrorKind, { title: string; body: string }> = {
  failure: {
    title: 'The translation didn’t finish',
    body: 'Something went wrong on our side. Nothing was translated partially, and your text is still here.',
  },
  'model-capacity': {
    title: 'This passage is too long for the current AI model',
    body: 'Your text is within the 20,000-character limit, but this model can’t take it in one go. Try the extended model, or shorten the text. We never translate part of a passage.',
  },
  'no-credits': {
    title: 'You’re out of AI credits',
    body: 'Translating uses credits. Your text is safe — add credits in Preferences, then try again.',
  },
  'ai-unavailable': {
    title: 'AI translation is unavailable right now',
    body: 'Nothing was lost. Please try again in a few minutes.',
  },
}

export function JobErrorAlert({ kind, during, onRetry, onExtendedModel, onEditText, onDismiss }: JobErrorAlertProps) {
  const copy = COPY[kind]
  return (
    <InlineAlert
      tone={kind === 'model-capacity' ? 'warning' : 'error'}
      title={copy.title}
      onDismiss={onDismiss}
      actions={
        <div className="flex flex-wrap gap-2">
          {kind === 'model-capacity' ? (
            <>
              <Button size="compact" onClick={onExtendedModel} leadingIcon={<ZapIcon className="h-4 w-4" />}>
                Try the extended model
              </Button>
              {onEditText && (
                <Button size="compact" variant="secondary" onClick={onEditText}>
                  Shorten the text
                </Button>
              )}
            </>
          ) : (
            <Button size="compact" variant="secondary" onClick={onRetry} leadingIcon={<RefreshCwIcon className="h-4 w-4" />}>
              Try again
            </Button>
          )}
        </div>
      }
    >
      {copy.body}
      {during === 'retranslate' && ' Your saved translation is unchanged.'}
    </InlineAlert>
  )
}
