import React from 'react'

export type BadgeTone =
  | 'neutral'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger'

export type BadgeSize = 'sm' | 'md'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  /** Visual tone of the badge. Defaults to 'neutral'. */
  tone?: BadgeTone
  /** Size of the badge. Defaults to 'md'. */
  size?: BadgeSize
  /** Renders a small filled dot before the label. */
  withDot?: boolean
  /** Optional leading icon element. Ignored when withDot is true. */
  icon?: React.ReactNode
  /** Badge label content. */
  children: React.ReactNode
}

const toneClasses: Record<BadgeTone, string> = {
  neutral: 'bg-slate-100 text-slate-700 ring-1 ring-inset ring-slate-200',
  info: 'bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-200',
  success: 'bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-200',
  warning: 'bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-200',
  danger: 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-200',
}

const dotClasses: Record<BadgeTone, string> = {
  neutral: 'bg-slate-500',
  info: 'bg-blue-500',
  success: 'bg-emerald-500',
  warning: 'bg-amber-500',
  danger: 'bg-red-500',
}

const sizeClasses: Record<BadgeSize, string> = {
  sm: 'h-5 gap-1 px-1.5 text-[11px]',
  md: 'h-6 gap-1.5 px-2 text-xs',
}

export function Badge({
  tone = 'neutral',
  size = 'md',
  withDot = false,
  icon,
  children,
  className = '',
  ...rest
}: BadgeProps) {
  return (
    <span
      className={[
        'inline-flex items-center whitespace-nowrap rounded-lg font-medium leading-none tracking-wide',
        sizeClasses[size],
        toneClasses[tone],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {withDot ? (
        <span
          aria-hidden="true"
          className={[
            'inline-block shrink-0 rounded-full',
            size === 'sm' ? 'h-1.5 w-1.5' : 'h-2 w-2',
            dotClasses[tone],
          ].join(' ')}
        />
      ) : icon ? (
        <span aria-hidden="true" className="inline-flex shrink-0 items-center [&>svg]:h-3.5 [&>svg]:w-3.5">
          {icon}
        </span>
      ) : null}
      {children}
    </span>
  )
}

