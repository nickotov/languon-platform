import React from 'react'
import { BarChart3Icon, HistoryIcon, MaximizeIcon, MinimizeIcon, XIcon } from 'lucide-react'
import { Dialog } from '../Dialog'
import { IconAction } from '../common/IconAction'
import { Button } from '../Button'
import type { Presentation } from '../../types/practice'

interface PracticeFrameProps {
  presentation: Presentation
  /** Narrow viewports always use the full viewport. */
  compact: boolean
  /** Render inside a gallery frame instead of covering the page. */
  contained?: boolean
  open?: boolean
  title: string
  progress?: React.ReactNode
  notice?: React.ReactNode
  body: React.ReactNode
  footer?: React.ReactNode
  onTogglePresentation: () => void
  onOpenHistory: () => void
  onOpenSummary: () => void
  onRequestClose: () => void
}

/**
 * One session, two presentations. The session lives above this component, so
 * switching never regenerates, re-checks or resets anything.
 */
export function PracticeFrame({
  presentation,
  compact,
  contained = false,
  open = true,
  title,
  progress,
  notice,
  body,
  footer,
  onTogglePresentation,
  onOpenHistory,
  onOpenSummary,
  onRequestClose,
}: PracticeFrameProps) {
  if (!open) return null
  const viewport = presentation === 'fullscreen' || compact

  const tools = (
    <div className="flex shrink-0 items-center gap-2">
      <Button
        size="compact"
        variant="secondary"
        leadingIcon={<BarChart3Icon aria-hidden className="h-4 w-4" />}
        onClick={onOpenSummary}
      >
        <span className="hidden sm:inline">Summary</span>
        <span className="sr-only sm:hidden">Session summary</span>
      </Button>
      <IconAction size="sm" icon={<HistoryIcon aria-hidden />} label="My practice history" onClick={onOpenHistory} />
      {!compact ? (
        <IconAction
          size="sm"
          icon={presentation === 'fullscreen' ? <MinimizeIcon aria-hidden /> : <MaximizeIcon aria-hidden />}
          label={presentation === 'fullscreen' ? 'Switch to dialog view' : 'Switch to full screen'}
          onClick={onTogglePresentation}
        />
      ) : null}
      <IconAction size="sm" icon={<XIcon aria-hidden />} label="Close practice" onClick={onRequestClose} />
    </div>
  )

  if (viewport) {
    return (
      <div
        role="dialog"
        aria-modal={contained ? undefined : true}
        aria-label={`Sentence practice — ${title}`}
        className={`${
          contained ? 'relative h-full' : 'fixed inset-0 z-40'
        } flex flex-col bg-background-canvas text-text-primary`}
        style={contained ? undefined : { height: '100dvh' }}
      >
        <header
          className="border-b border-border-default bg-background-surface"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <div className="mx-auto flex w-full max-w-3xl items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">Sentence practice</p>
              <h2 className="truncate text-base font-semibold text-text-primary">{title}</h2>
            </div>
            {tools}
          </div>
          {progress ? <div className="mx-auto w-full max-w-3xl px-4 pb-2">{progress}</div> : null}
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-5 md:py-8">
            {notice}
            {body}
          </div>
        </div>
        {footer ? (
          <footer
            className="border-t border-border-default bg-background-surface"
            style={{ paddingBottom: 'max(var(--spacing-12), env(safe-area-inset-bottom))' }}
          >
            <div className="mx-auto w-full max-w-3xl px-4 pt-3">{footer}</div>
          </footer>
        ) : null}
      </div>
    )
  }

  const dialogInner = (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border-default pb-3">
        {progress ?? <span />}
        {tools}
      </div>
      {notice}
      {body}
    </div>
  )

  if (contained) {
    return (
      <div
        role="dialog"
        aria-label={`Sentence practice — ${title}`}
        className="flex h-full flex-col overflow-hidden rounded-2xl border border-border-default bg-background-surface text-text-primary shadow-lg"
      >
        <div className="border-b border-border-default px-5 py-3">
          <h2 className="text-base font-semibold text-text-primary">{title}</h2>
          <p className="text-sm text-text-secondary">Sentence practice</p>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{dialogInner}</div>
        {footer ? <div className="border-t border-border-default px-5 py-3">{footer}</div> : null}
      </div>
    )
  }

  return (
    <Dialog
      open
      onClose={onRequestClose}
      size="lg"
      title={title}
      description="Sentence practice"
      showCloseButton={false}
      dismissOnOverlayClick={false}
      footer={footer}
      className="bg-background-surface text-text-primary"
    >
      {dialogInner}
    </Dialog>
  )
}

