import React from 'react'
import { Button } from '../Button'
import { InlineAlert } from '../InlineAlert'
import { useInterfaceText } from '../../hooks/useInterfaceText'
import type { PreparationRun } from '../../types/preparation'

export interface NoticeActions {
  onResume: () => void
  onCheckStatus: () => void
  onStartAgain: () => void
  onOpenLibrary: () => void
  onOpenAiSettings?: () => void
  onLeave: () => void
  onSignIn: () => void
  onDismissRecovered: () => void
}

/** One honest notice per state; retained work is always stated, nothing is silently retried. */
export function PreparationNotice({ run, actions }: { run: PreparationRun; actions: NoticeActions }) {
  const { P } = useInterfaceText()
  const btn = (label: string, onClick: () => void, primary = false) => (
    <Button key={label} size="compact" variant={primary ? 'primary' : 'secondary'} onClick={onClick}>
      {label}
    </Button>
  )

  if (run.status === 'uncertain') {
    return (
      <InlineAlert tone="warning" title={P('uncertainTitle')} actions={btn(P('checkStatus'), actions.onCheckStatus, true)}>
        {P('uncertainBody')}
      </InlineAlert>
    )
  }
  if (run.status === 'stale' || run.status === 'expired') {
    return (
      <InlineAlert
        tone="info"
        title={P('stale')}
        actions={<div className="flex flex-wrap gap-2">{btn(P('startAgain'), actions.onStartAgain, true)}{btn(P('openLibrary'), actions.onOpenLibrary)}</div>}
      >
        {run.status === 'stale' ? P('staleBody') : P('expiredBody')}
      </InlineAlert>
    )
  }
  if (run.status === 'access-lost') {
    const kind = run.accessLoss ?? 'revoked'
    return (
      <InlineAlert
        tone="error"
        title={kind === 'session' ? P('session') : kind === 'removed' ? P('removedDict') : P('revoked')}
        actions={kind === 'session' ? btn(P('signIn'), actions.onSignIn, true) : btn(P('toLibrary'), actions.onLeave, true)}
      >
        {kind === 'session' ? P('sessionBody') : kind === 'removed' ? P('removedDictBody') : P('revokedBody')}
      </InlineAlert>
    )
  }
  if (run.status === 'interrupted' && run.interruption) {
    const map = {
      credits: { title: P('credits'), body: P('creditsBody'), tone: 'warning' as const },
      capacity: { title: P('capacity'), body: P('capacityBody'), tone: 'info' as const },
      model: { title: P('model'), body: P('modelBody'), tone: 'warning' as const },
      provider: { title: P('provider'), body: P('providerBody'), tone: 'error' as const },
      network: { title: P('network'), body: P('networkBody'), tone: 'warning' as const },
    }[run.interruption]
    const resumeLabel = run.interruption === 'network' ? P('reconnect') : P('resume')
    return (
      <InlineAlert
        tone={map.tone}
        title={map.title}
        actions={
          <div className="flex flex-wrap gap-2">
            {btn(resumeLabel, actions.onResume, true)}
            {run.interruption === 'model' && actions.onOpenAiSettings ? btn(P('openAiSettings'), actions.onOpenAiSettings) : null}
          </div>
        }
      >
        {map.body}
      </InlineAlert>
    )
  }
  if (run.status === 'paused') {
    return (
      <InlineAlert tone="info" title={P('paused')} actions={btn(P('resume'), actions.onResume, true)}>
        {P('pausedBody')}
      </InlineAlert>
    )
  }
  if (run.status === 'completed') {
    const uncovered = run.totalWords - run.covered
    return (
      <InlineAlert tone="success" title={uncovered > 0 ? P('chipDone') : P('completed')}>
        {uncovered > 0 ? P('completedPartial', { n: uncovered }) : run.generated === 0 ? P('completedReuseOnly') : P('notPractice')}
        {uncovered > 0 || run.generated === 0 ? ` ${P('notPractice')}` : ''}
      </InlineAlert>
    )
  }
  if (run.recovered) {
    return (
      <InlineAlert tone="success" onDismiss={actions.onDismissRecovered} title={P('recovered')} />
    )
  }
  return null
}

