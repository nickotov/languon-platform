import React, { useEffect, useRef } from 'react'
import { XIcon } from 'lucide-react'
import { Dialog } from '../Dialog'
import { IconButton } from '../IconButton'
import { useIsCompact } from '../../hooks/useMediaQuery'

interface ResponsiveSheetProps {
  open: boolean
  onClose: () => void
  title: string
  description?: string
  footer?: React.ReactNode
  size?: 'sm' | 'md' | 'lg'
  children: React.ReactNode
}

/**
 * Focused desktop dialog; bottom sheet on narrow viewports.
 * Both variants trap focus, close on Escape, and keep the save area reachable.
 */
export function ResponsiveSheet({
  open,
  onClose,
  title,
  description,
  footer,
  size = 'lg',
  children,
}: ResponsiveSheetProps) {
  const compact = useIsCompact()
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!compact || !open) return undefined
    restoreRef.current = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    panelRef.current?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab' || !panelRef.current) return
      const focusable = panelRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      document.removeEventListener('keydown', onKeyDown, true)
      document.body.style.overflow = previousOverflow
      restoreRef.current?.focus?.()
    }
  }, [compact, open, onClose])

  if (!open) return null

  if (!compact) {
    return (
      <Dialog
        open={open}
        onClose={onClose}
        title={title}
        description={description}
        size={size}
        dismissOnOverlayClick={false}
        footer={footer}
        className="bg-background-surface text-text-primary"
      >
        {children}
      </Dialog>
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end">
      <div
        className="absolute inset-0 bg-overlay"
        aria-hidden
        onClick={onClose}
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="relative flex max-h-[92vh] w-full flex-col rounded-t-3xl border border-border-default bg-background-surface focus-visible:outline-none"
      >
        <div className="flex items-start gap-3 border-b border-border-default px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-text-primary">{title}</h2>
            {description ? (
              <p className="mt-0.5 text-sm text-text-secondary">{description}</p>
            ) : null}
          </div>
          <IconButton
            size="sm"
            variant="ghost"
            icon={<XIcon aria-hidden />}
            label="Close"
            onClick={onClose}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer ? (
          <div className="border-t border-border-default bg-background-surface px-4 py-3">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  )
}

