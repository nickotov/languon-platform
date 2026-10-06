import React, { useEffect, useRef } from 'react'
import { Button } from '../Button'

interface LeaveGuardProps {
  variant: 'leave' | 'settings'
  unsentDraft: boolean
  pendingLabel: string | null
  onKeep: () => void
  onConfirm: () => void
}

/**
 * In-surface confirmation (stays visible inside native full screen).
 * Truthful about pending work: closing doesn’t cancel it or refund credits.
 */
export function LeaveGuard({ variant, unsentDraft, pendingLabel, onKeep, onConfirm }: LeaveGuardProps) {
  const actionsRef = useRef<HTMLDivElement>(null)
  useEffect(() => actionsRef.current?.querySelector<HTMLButtonElement>('button')?.focus(), [])

  return (
    <div className="absolute inset-0 z-50 flex items-end justify-center bg-overlay p-4 sm:items-center" onKeyDown={(event) => event.key === 'Escape' && (event.stopPropagation(), onKeep())}>
      <div role="alertdialog" aria-modal="true" aria-labelledby="leave-guard-title" aria-describedby="leave-guard-body" className="w-full max-w-sm rounded-2xl border border-border-default bg-background-surface p-5 text-text-primary shadow-lg">
        <h2 id="leave-guard-title" className="text-base font-semibold">{variant === 'settings' ? 'Discard your AI settings change?' : 'Leave practice?'}</h2>
        <div id="leave-guard-body" className="mt-2 space-y-2 text-sm text-text-secondary">
          {variant === 'settings' ? <p>Your unsaved AI preference will be lost. Your exercise and answer are unaffected.</p> : null}
          {variant === 'leave' && unsentDraft ? <p>Your unsent translation will be discarded.</p> : null}
          {variant === 'leave' && pendingLabel ? (
            <p>
              {pendingLabel} is still running. Leaving hides it but doesn’t cancel it, and already-started AI work may still use credits. If it finishes, the result is saved to your
              personal history.
            </p>
          ) : null}
        </div>
        <div ref={actionsRef} className="mt-4 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onKeep}>
            {variant === 'settings' ? 'Keep editing' : 'Keep practising'}
          </Button>
          <Button onClick={onConfirm}>{variant === 'settings' ? 'Discard' : 'Leave practice'}</Button>
        </div>
      </div>
    </div>
  )
}

