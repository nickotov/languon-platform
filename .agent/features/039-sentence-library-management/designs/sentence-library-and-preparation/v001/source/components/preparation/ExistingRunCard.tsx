import React from 'react'
import { PauseIcon, PlayIcon } from 'lucide-react'
import { Button } from '../Button'
import { InlineAlert } from '../InlineAlert'
import { useInterfaceText } from '../../hooks/useInterfaceText'
import type { PreparationRun } from '../../types/preparation'

interface ExistingRunCardProps {
  run: PreparationRun
  onView: () => void
  onStop: () => void
  onResume: () => void
}

/** Shown in setup when background preparation already exists — never starts a duplicate. */
export function ExistingRunCard({ run, onView, onStop, onResume }: ExistingRunCardProps) {
  const { P } = useInterfaceText()
  const resumable = run.status === 'paused' || run.status === 'interrupted'
  const stoppable = run.status === 'running' || run.status === 'queued' || run.status === 'stopping'

  return (
    <InlineAlert
      tone="info"
      title={P('existingTitle')}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button size="compact" onClick={onView}>
            {P('viewProgress')}
          </Button>
          {resumable ? (
            <Button size="compact" variant="secondary" leadingIcon={<PlayIcon aria-hidden className="h-4 w-4" />} onClick={onResume}>
              {P('resume')}
            </Button>
          ) : null}
          {stoppable ? (
            <Button
              size="compact"
              variant="secondary"
              leadingIcon={<PauseIcon aria-hidden className="h-4 w-4" />}
              disabled={run.status === 'stopping'}
              onClick={onStop}
            >
              {P('stop')}
            </Button>
          ) : null}
        </div>
      }
    >
      {P('existingBody')} {P('readyWords', { done: run.covered, total: run.totalWords })}
    </InlineAlert>
  )
}

