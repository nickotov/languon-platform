import React from 'react'
import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  InfoIcon,
  LightbulbIcon,
  XCircleIcon,
  XIcon,
} from 'lucide-react'

export type InlineAlertTone = 'info' | 'success' | 'warning' | 'error' | 'tip'

export interface InlineAlertProps {
  /** Visual tone of the alert. Always paired with an icon so meaning is never color-only. */
  tone?: InlineAlertTone
  /** Short, bold headline for the alert. */
  title?: string
  /** Body copy or nodes describing the issue and next step. */
  children?: React.ReactNode
  /** Optional actions rendered below the message (links or buttons). */
  actions?: React.ReactNode
  /** Renders a dismiss button when provided. */
  onDismiss?: () => void
  /** Accessible label for the dismiss button. */
  dismissLabel?: string
  /** Replaces the default tone icon. */
  icon?: React.ReactNode
  /** Hides the icon entirely. Not recommended — color alone should not convey meaning. */
  hideIcon?: boolean
  className?: string
}

const toneStyles: Record<
  InlineAlertTone,
  { container: string; icon: string; title: string; body: string; Icon: React.ComponentType<{ className?: string }> }
> = {
  info: {
    container: 'border-blue-200 bg-blue-50',
    icon: 'text-blue-600',
    title: 'text-blue-900',
    body: 'text-blue-800',
    Icon: InfoIcon,
  },
  success: {
    container: 'border-green-200 bg-green-50',
    icon: 'text-green-600',
    title: 'text-green-900',
    body: 'text-green-800',
    Icon: CheckCircle2Icon,
  },
  warning: {
    container: 'border-amber-200 bg-amber-50',
    icon: 'text-amber-600',
    title: 'text-amber-900',
    body: 'text-amber-800',
    Icon: AlertTriangleIcon,
  },
  error: {
    container: 'border-red-200 bg-red-50',
    icon: 'text-red-600',
    title: 'text-red-900',
    body: 'text-red-800',
    Icon: XCircleIcon,
  },
  tip: {
    container: 'border-slate-200 bg-slate-50',
    icon: 'text-slate-600',
    title: 'text-slate-900',
    body: 'text-slate-700',
    Icon: LightbulbIcon,
  },
}

export function InlineAlert({
  tone = 'info',
  title,
  children,
  actions,
  onDismiss,
  dismissLabel = 'Dismiss alert',
  icon,
  hideIcon = false,
  className = '',
}: InlineAlertProps) {
  const styles = toneStyles[tone]
  const ToneIcon = styles.Icon
  const isUrgent = tone === 'error' || tone === 'warning'

  return (
    <div
      role={isUrgent ? 'alert' : 'status'}
      aria-live={isUrgent ? 'assertive' : 'polite'}
      className={`flex w-full items-start gap-3 rounded-lg border p-4 ${styles.container} ${className}`}
    >
      {!hideIcon && (
        <span className={`mt-0.5 shrink-0 ${styles.icon}`} aria-hidden="true">
          {icon ?? <ToneIcon className="h-5 w-5" />}
        </span>
      )}

      <div className="min-w-0 flex-1">
        {title && <p className={`text-sm font-semibold leading-5 ${styles.title}`}>{title}</p>}
        {children && (
          <div className={`text-sm leading-5 ${styles.body} ${title ? 'mt-1' : ''}`}>{children}</div>
        )}
        {actions && <div className="mt-3 flex flex-wrap items-center gap-3">{actions}</div>}
      </div>

      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label={dismissLabel}
          className={`-m-1 shrink-0 rounded p-1 transition-colors hover:bg-black/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-current ${styles.icon}`}
        >
          <XIcon className="h-4 w-4" />
        </button>
      )}
    </div>
  )
}

