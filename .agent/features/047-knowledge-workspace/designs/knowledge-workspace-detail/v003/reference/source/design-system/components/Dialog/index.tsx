import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
} from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { XIcon } from 'lucide-react'

export type DialogSize = 'sm' | 'md' | 'lg'

export interface DialogProps {
  /** Controls visibility of the dialog. */
  open: boolean
  /** Called when the user dismisses via overlay click, Escape, or the close button. */
  onClose: () => void
  /** Accessible title. Rendered in the header when `showHeader` is true. */
  title?: string
  /** Supporting copy rendered under the title. */
  description?: string
  /** Max width of the dialog surface. */
  size?: DialogSize
  /** Render the header row with title, description, and close button. */
  showHeader?: boolean
  /** Show the close (X) button in the header. */
  showCloseButton?: boolean
  /** Allow dismissing by clicking the overlay. Defaults to true. */
  dismissOnOverlayClick?: boolean
  /** Allow dismissing with the Escape key. Defaults to true. */
  dismissOnEscape?: boolean
  /** Footer actions, typically DialogActions with buttons. */
  footer?: React.ReactNode
  /** Body content. */
  children?: React.ReactNode
  className?: string
}

const SIZE_CLASSES: Record<DialogSize, string> = {
  sm: 'max-w-sm',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
}

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

interface DialogContextValue {
  onClose: () => void
}

const DialogContext = createContext<DialogContextValue | null>(null)

/** Access the enclosing Dialog's close handler. */
export function useDialog(): DialogContextValue {
  const ctx = useContext(DialogContext)
  if (!ctx) {
    throw new Error('useDialog must be used within a Dialog')
  }
  return ctx
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  size = 'md',
  showHeader = true,
  showCloseButton = true,
  dismissOnOverlayClick = true,
  dismissOnEscape = true,
  footer,
  children,
  className,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const previouslyFocused = useRef<HTMLElement | null>(null)
  const reactId = useId()
  const titleId = `dialog-title-${reactId}`
  const descriptionId = `dialog-description-${reactId}`

  const getFocusable = useCallback((): HTMLElement[] => {
    const panel = panelRef.current
    if (!panel) return []
    return Array.from(
      panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
    ).filter((el) => el.offsetParent !== null || el === document.activeElement)
  }, [])

  // Lock scroll and restore focus on close.
  useEffect(() => {
    if (!open) return
    previouslyFocused.current = document.activeElement as HTMLElement | null
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    const raf = requestAnimationFrame(() => {
      const focusable = getFocusable()
      ;(focusable[0] ?? panelRef.current)?.focus()
    })

    return () => {
      cancelAnimationFrame(raf)
      document.body.style.overflow = overflow
      previouslyFocused.current?.focus?.()
    }
  }, [open, getFocusable])

  // Escape handling + focus trap.
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && dismissOnEscape) {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = getFocusable()
      if (focusable.length === 0) {
        event.preventDefault()
        panelRef.current?.focus()
        return
      }
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      if (event.shiftKey && (active === first || active === panelRef.current)) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && active === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown, true)
    return () => document.removeEventListener('keydown', handleKeyDown, true)
  }, [open, dismissOnEscape, onClose, getFocusable])

  if (typeof document === 'undefined') return null

  return createPortal(
    <AnimatePresence>
      {open ? (
        <DialogContext.Provider value={{ onClose }}>
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              aria-hidden="true"
              onClick={dismissOnOverlayClick ? onClose : undefined}
              className="absolute inset-0 bg-neutral-950/50 backdrop-blur-sm"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
            />
            <motion.div
              ref={panelRef}
              role="dialog"
              aria-modal="true"
              aria-labelledby={title ? titleId : undefined}
              aria-describedby={description ? descriptionId : undefined}
              tabIndex={-1}
              initial={{ opacity: 0, scale: 0.96, y: 8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 8 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className={[
                'relative w-full rounded-[24px] bg-white shadow-2xl ring-1 ring-neutral-900/10 outline-none',
                'max-h-[85vh] overflow-hidden flex flex-col',
                SIZE_CLASSES[size],
                className ?? '',
              ]
                .join(' ')
                .trim()}
            >
              {showHeader && (title || description || showCloseButton) ? (
                <header className="flex items-start gap-4 px-6 pt-6">
                  <div className="min-w-0 flex-1">
                    {title ? (
                      <h2
                        id={titleId}
                        className="text-lg font-semibold leading-6 text-neutral-900"
                      >
                        {title}
                      </h2>
                    ) : null}
                    {description ? (
                      <p
                        id={descriptionId}
                        className="mt-1.5 text-sm leading-5 text-neutral-500"
                      >
                        {description}
                      </p>
                    ) : null}
                  </div>
                  {showCloseButton ? (
                    <button
                      type="button"
                      onClick={onClose}
                      aria-label="Close dialog"
                      className="-mr-1 -mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
                    >
                      <XIcon className="h-4 w-4" aria-hidden="true" />
                    </button>
                  ) : null}
                </header>
              ) : null}

              {children ? (
                <div className="flex-1 overflow-y-auto px-6 py-5 text-sm leading-6 text-neutral-700">
                  {children}
                </div>
              ) : (
                <div className="h-2" />
              )}

              {footer ? (
                <footer className="border-t border-neutral-200 px-6 py-4">
                  {footer}
                </footer>
              ) : null}
            </motion.div>
          </div>
        </DialogContext.Provider>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}

export interface DialogActionsProps {
  children: React.ReactNode
  /** Horizontal alignment of the action buttons. */
  align?: 'start' | 'end' | 'between'
  className?: string
}

/** Convenience row for dialog footer buttons. */
export function DialogActions({
  children,
  align = 'end',
  className,
}: DialogActionsProps) {
  const alignment =
    align === 'start'
      ? 'justify-start'
      : align === 'between'
        ? 'justify-between'
        : 'justify-end'
  return (
    <div
      className={['flex flex-wrap items-center gap-3', alignment, className ?? '']
        .join(' ')
        .trim()}
    >
      {children}
    </div>
  )
}

