import React from 'react'
import { PauseIcon, PlayIcon } from 'lucide-react'
import { Button } from '../Button'
import { ResponsiveSheet } from '../card/ResponsiveSheet'
import { PreparationProgress } from './PreparationProgress'
import type { NoticeActions } from './PreparationNotice'
import { useInterfaceText } from '../../hooks/useInterfaceText'
import type { PreparationRun, PrepRound } from '../../types/preparation'

interface PreparationSheetProps {
  open: boolean
  run: PreparationRun
  dictionaryName: string
  onClose: () => void
  onStop: () => void
  onStartRound: (round: PrepRound) => void
  actions: NoticeActions
}

/** The one progress surface. Always closable — work continues in the background. */
export function PreparationSheet({ open, run, dictionaryName, onClose, onStop, onStartRound, actions }: PreparationSheetProps) {
  const { P } = useInterfaceText()
  const running = run.status === 'running' || run.status === 'queued' || run.status === 'checking'
  const stopping = run.status === 'stopping'
  const resumable = run.status === 'paused' || run.status === 'interrupted'
  const working = running || stopping || run.status === 'submitting'

  const footer = (
    <div className="space-y-2">
      {working ? <p className="text-xs text-text-secondary">{P('backgroundNote')}</p> : null}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {running || stopping ? (
          <Button variant="secondary" leadingIcon={<PauseIcon aria-hidden className="h-4 w-4" />} loading={stopping} disabled={stopping} onClick={onStop}>
            {P('stop')}
          </Button>
        ) : null}
        {resumable ? (
          <Button variant="secondary" leadingIcon={<PlayIcon aria-hidden className="h-4 w-4" />} onClick={actions.onResume}>
            {run.interruption === 'network' ? P('reconnect') : P('resume')}
          </Button>
        ) : null}
        <Button variant={working ? 'primary' : 'secondary'} onClick={onClose}>
          {working ? P('background') : P('close')}
        </Button>
      </div>
    </div>
  )

  return (
    <ResponsiveSheet open={open} onClose={onClose} size="md" title={P('title')} description={dictionaryName} footer={footer}>
      <PreparationProgress run={run} actions={actions} onStartRound={onStartRound} />
    </ResponsiveSheet>
  )
}

