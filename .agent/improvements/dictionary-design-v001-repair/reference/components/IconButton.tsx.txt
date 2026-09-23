import React, { forwardRef, useId, useState } from 'react'
import { twMerge } from 'tailwind-merge'

export type IconButtonVariant =
  | 'primary'
  | 'secondary'
  | 'outline'
  | 'ghost'
  | 'danger'

export type IconButtonSize = 'sm' | 'md' | 'lg'

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right'

export interface IconButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** The icon element to render (e.g. a lucide-react icon). */
  icon: React.ReactNode
  /** Accessible label, also used as the tooltip content. */
  label: string
  variant?: IconButtonVariant
  size?: IconButtonSize
  /** Fully rounded instead of the default rounded square. */
  rounded?: boolean
  /** Shows a spinner and disables interaction. */
  loading?: boolean
  /** Hide the hover/focus tooltip (the label is still announced). */
  showTooltip?: boolean
  tooltipPlacement?: TooltipPlacement
}

const variantClasses: Record<IconButtonVariant, string> = {
  primary:
    'bg-neutral-900 text-white hover:bg-neutral-800 active:bg-neutral-950 focus-visible:outline-neutral-900',
  secondary:
    'bg-neutral-100 text-neutral-900 hover:bg-neutral-200 active:bg-neutral-300 focus-visible:outline-neutral-900',
  outline:
    'bg-white text-neutral-900 border border-neutral-300 hover:bg-neutral-50 active:bg-neutral-100 focus-visible:outline-neutral-900',
  ghost:
    'bg-transparent text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 active:bg-neutral-200 focus-visible:outline-neutral-900',
  danger:
    'bg-red-600 text-white hover:bg-red-700 active:bg-red-800 focus-visible:outline-red-600',
}

const sizeClasses: Record<IconButtonSize, string> = {
  sm: 'h-8 w-8',
  md: 'h-10 w-10',
  lg: 'h-12 w-12',
}

const iconSizeClasses: Record<IconButtonSize, string> = {
  sm: '[&_svg]:h-4 [&_svg]:w-4',
  md: '[&_svg]:h-5 [&_svg]:w-5',
  lg: '[&_svg]:h-6 [&_svg]:w-6',
}

const spinnerSizeClasses: Record<IconButtonSize, string> = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-6 w-6',
}

const tooltipPlacementClasses: Record<TooltipPlacement, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  function IconButton(
    {
      icon,
      label,
      variant = 'secondary',
      size = 'md',
      rounded = false,
      loading = false,
      showTooltip = true,
      tooltipPlacement = 'top',
      disabled,
      className,
      onMouseEnter,
      onMouseLeave,
      onFocus,
      onBlur,
      ...props
    },
    ref,
  ) {
    const [open, setOpen] = useState(false)
    const tooltipId = useId()
    const isDisabled = disabled || loading
    const tooltipVisible = showTooltip && open && !isDisabled

    return (
      <span className="relative inline-flex">
        <button
          ref={ref}
          type="button"
          aria-label={label}
          aria-busy={loading || undefined}
          aria-describedby={tooltipVisible ? tooltipId : undefined}
          disabled={isDisabled}
          className={twMerge(
            'inline-flex shrink-0 items-center justify-center transition-colors duration-150',
            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
            'disabled:pointer-events-none disabled:opacity-50',
            rounded ? 'rounded-full' : 'rounded-md',
            sizeClasses[size],
            iconSizeClasses[size],
            variantClasses[variant],
            className,
          )}
          onMouseEnter={(event) => {
            setOpen(true)
            onMouseEnter?.(event)
          }}
          onMouseLeave={(event) => {
            setOpen(false)
            onMouseLeave?.(event)
          }}
          onFocus={(event) => {
            setOpen(true)
            onFocus?.(event)
          }}
          onBlur={(event) => {
            setOpen(false)
            onBlur?.(event)
          }}
          {...props}
        >
          {loading ? (
            <svg
              className={twMerge('animate-spin', spinnerSizeClasses[size])}
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="3"
              />
              <path
                className="opacity-90"
                d="M12 2a10 10 0 0 1 10 10"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
              />
            </svg>
          ) : (
            <span aria-hidden="true" className="inline-flex">
              {icon}
            </span>
          )}
        </button>

        {tooltipVisible ? (
          <span
            id={tooltipId}
            role="tooltip"
            className={twMerge(
              'pointer-events-none absolute z-50 whitespace-nowrap rounded-md bg-neutral-900 px-2 py-1 text-xs font-medium text-white shadow-md',
              tooltipPlacementClasses[tooltipPlacement],
            )}
          >
            {label}
          </span>
        ) : null}
      </span>
    )
  },
)

