import React from 'react'
import { AlertTriangleIcon, CheckCircle2Icon, Clock3Icon, Loader2Icon, PauseIcon } from 'lucide-react'
import { useInterfaceText } from '../../hooks/useInterfaceText'
import type { PreparationRun } from '../../types/preparation'

/** Compact persistent indicator on the dictionary and library headers; opens the same progress. */
export function PreparationChip({ run, onOpen }: { run: PreparationRun | undefined; onOpen: () => void }) {
  const { P, L } = useInterfaceText()
  if (!run) return null
  const vars = { done: run.covered, total: run.totalWords }

  let icon: React.ReactNode
  let label: string
  let tone = 'border-border-strong bg-background-surface text-text-primary'
  switch (run.status) {
    case 'submitting':
    case 'checking':
    case 'queued':
    case 'running':
      icon = <Loader2Icon aria-hidden className="h-4 w-4 animate-spin text-primary-default motion-reduce:animate-none" />
      label = P('chipRunning', vars)
      break
    case 'stopping':
      icon = <Loader2Icon aria-hidden className="h-4 w-4 animate-spin motion-reduce:animate-none" />
      label = P('chipStopping')
      break
    case 'paused':
      icon = <PauseIcon aria-hidden className="h-4 w-4" />
      label = P('chipPaused', vars)
      break
    case 'completed':
      icon = <CheckCircle2Icon aria-hidden className="h-4 w-4 text-success-default" />
      label = P('chipDone')
      break
    case 'stale':
    case 'expired':
      icon = <Clock3Icon aria-hidden className="h-4 w-4" />
      label = P('chipExpired')
      break
    default:
      icon = <AlertTriangleIcon aria-hidden className="h-4 w-4 text-warning-default" />
      label = run.interruption === 'credits' ? P('chipCredits') : P('chipAttention')
      tone = 'border-warning-default bg-warning-subtle text-text-primary'
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`${label}. ${L('preparationChipLabel')}`}
      className={`inline-flex min-h-[36px] max-w-full items-center gap-2 rounded-full border px-3 text-sm font-medium transition-colors hover:bg-background-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-background-surface ${tone}`}
    >
      {icon}
      <span className="truncate">{label}</span>
    </button>
  )
}

