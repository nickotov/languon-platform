import React, { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  InfoIcon,
  Loader2Icon,
  XCircleIcon,
  XIcon,
} from 'lucide-react'
import { twMerge } from 'tailwind-merge'

export type ToastVariant = 'info' | 'success' | 'warning' | 'error' | 'loading'

export type ToastPosition =
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right'

export interface ToastProps {
  /** Short, primary message. */
  title: string
  /** Optional supporting copy. */
  description?: string
  /** Visual + semantic tone of the toast. */
  variant?: ToastVariant
  /** Controls visibility. Defaults to true (uncontrolled, self-dismissing). */
  open?: boolean
  /** Milliseconds before auto-dismiss. Pass 0 or null to persist. */
  duration?: number | null
  /** Called when the toast dismisses (timer, close button, or action). */
  onDismiss?: () => void
  /** Optional inline action, e.g. "Undo". */
  action?: {
    label: string
    onClick: () => void
  }
  /** Show the close button. Defaults to true. */
  dismissible?: boolean
  /** Corner the toast animates from when anchored. Defaults to 'bottom-right'. */
  position?: ToastPosition
  /** Render fixed to the viewport corner. Defaults to false (inline). */
  anchored?: boolean
  className?: string
}

const VARIANT_STYLES: Record<
  ToastVariant,
  { icon: React.ElementType; iconClass: string; accentClass: string }
> = {
  info: {
    icon: InfoIcon,
    iconClass: 'text-sky-600',
    accentClass: 'bg-sky-500',
  },
  success: {
    icon: CheckCircle2Icon,
    iconClass: 'text-emerald-600',
    accentClass: 'bg-emerald-500',
  },
  warning: {
    icon: AlertTriangleIcon,
    iconClass: 'text-amber-600',
    accentClass: 'bg-amber-500',
  },
  error: {
    icon: XCircleIcon,
    iconClass: 'text-red-600',
    accentClass: 'bg-red-500',
  },
  loading: {
    icon: Loader2Icon,
    iconClass: 'text-slate-500 animate-spin',
    accentClass: 'bg-slate-400',
  },
}

const POSITION_STYLES: Record<ToastPosition, string> = {
  'top-left': 'top-4 left-4',
  'top-right': 'top-4 right-4',
  'bottom-left': 'bottom-4 left-4',
  'bottom-right': 'bottom-4 right-4',
}

export function Toast({
  title,
  description,
  variant = 'info',
  open,
  duration = 5000,
  onDismiss,
  action,
  dismissible = true,
  position = 'bottom-right',
  anchored = false,
  className,
}: ToastProps) {
  const isControlled = open !== undefined
  const [internalOpen, setInternalOpen] = useState(true)
  const visible = isControlled ? open : internalOpen
  const paused = useRef(false)

  const close = () => {
    if (!isControlled) setInternalOpen(false)
    onDismiss?.()
  }

  useEffect(() => {
    if (!visible || !duration || variant === 'loading') return
    const timer = window.setTimeout(() => {
      if (!paused.current) close()
    }, duration)
    return () => window.clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, duration, variant])

  const { icon: VariantIcon, iconClass, accentClass } = VARIANT_STYLES[variant]
  const fromTop = position.startsWith('top')

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          role={variant === 'error' ? 'alert' : 'status'}
          aria-live={variant === 'error' ? 'assertive' : 'polite'}
          initial={{ opacity: 0, y: fromTop ? -12 : 12, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: fromTop ? -8 : 8, scale: 0.97 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
          onMouseEnter={() => {
            paused.current = true
          }}
          onMouseLeave={() => {
            paused.current = false
          }}
          className={twMerge(
            'pointer-events-auto relative flex w-full max-w-sm items-start gap-3 overflow-hidden rounded-lg border border-slate-200 bg-white p-4 pl-5 shadow-lg shadow-slate-900/5',
            anchored ? `fixed z-50 ${POSITION_STYLES[position]}` : '',
            className,
          )}
        >
          <span
            aria-hidden="true"
            className={twMerge(
              'absolute inset-y-0 left-0 w-1',
              accentClass,
            )}
          />
          <VariantIcon
            aria-hidden="true"
            className={twMerge('mt-0.5 h-5 w-5 shrink-0', iconClass)}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-5 text-slate-900">
              {title}
            </p>
            {description && (
              <p className="mt-1 text-sm leading-5 text-slate-600">
                {description}
              </p>
            )}
            {action && (
              <button
                type="button"
                onClick={() => {
                  action.onClick()
                  close()
                }}
                className="mt-2 rounded text-sm font-semibold text-slate-900 underline underline-offset-2 transition-colors hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
              >
                {action.label}
              </button>
            )}
          </div>
          {dismissible && (
            <button
              type="button"
              onClick={close}
              aria-label="Dismiss notification"
              className="-mr-1 -mt-1 rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-900 focus-visible:ring-offset-2"
            >
              <XIcon aria-hidden="true" className="h-4 w-4" />
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

