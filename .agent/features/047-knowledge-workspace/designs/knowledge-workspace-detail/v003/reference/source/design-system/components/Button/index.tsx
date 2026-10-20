import React from 'react'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger'
export type ButtonSize = 'compact' | 'default' | 'large'

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  fullWidth?: boolean
  leadingIcon?: React.ReactNode
  trailingIcon?: React.ReactNode
}

const baseClasses = [
  'inline-flex items-center justify-center gap-2',
  'font-medium whitespace-nowrap select-none',
  'rounded-[var(--radius-control,0.75rem)]',
  'border border-transparent',
  'transition-colors duration-150',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
  'focus-visible:ring-[var(--color-ring,theme(colors.slate.900))]',
  'focus-visible:ring-offset-[var(--color-surface,theme(colors.white))]',
  'disabled:pointer-events-none disabled:opacity-50',
].join(' ')

const variantClasses: Record<ButtonVariant, string> = {
  primary: [
    'bg-[var(--color-primary,theme(colors.slate.900))]',
    'text-[var(--color-primary-foreground,theme(colors.white))]',
    'hover:bg-[var(--color-primary-hover,theme(colors.slate.800))]',
    'active:bg-[var(--color-primary-active,theme(colors.slate.950))]',
  ].join(' '),
  secondary: [
    'bg-[var(--color-surface,theme(colors.white))]',
    'text-[var(--color-foreground,theme(colors.slate.900))]',
    'border-[var(--color-border,theme(colors.slate.300))]',
    'hover:bg-[var(--color-surface-hover,theme(colors.slate.100))]',
    'active:bg-[var(--color-surface-active,theme(colors.slate.200))]',
  ].join(' '),
  ghost: [
    'bg-transparent',
    'text-[var(--color-foreground,theme(colors.slate.900))]',
    'hover:bg-[var(--color-surface-hover,theme(colors.slate.100))]',
    'active:bg-[var(--color-surface-active,theme(colors.slate.200))]',
  ].join(' '),
  danger: [
    'bg-[var(--color-danger,theme(colors.red.600))]',
    'text-[var(--color-danger-foreground,theme(colors.white))]',
    'hover:bg-[var(--color-danger-hover,theme(colors.red.700))]',
    'active:bg-[var(--color-danger-active,theme(colors.red.800))]',
    'focus-visible:ring-[var(--color-danger,theme(colors.red.600))]',
  ].join(' '),
}

const sizeClasses: Record<ButtonSize, string> = {
  compact: 'h-9 px-3 text-sm',
  default: 'h-11 px-4 text-sm',
  large: 'h-[3.25rem] px-6 text-base',
}

export function Button({
  variant = 'primary',
  size = 'default',
  loading = false,
  fullWidth = false,
  leadingIcon,
  trailingIcon,
  disabled,
  className = '',
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading

  return (
    <button
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={[
        baseClasses,
        variantClasses[variant],
        sizeClasses[size],
        fullWidth ? 'w-full' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...rest}
    >
      {loading ? (
        <Spinner />
      ) : (
        leadingIcon && (
          <span className="shrink-0" aria-hidden="true">
            {leadingIcon}
          </span>
        )
      )}
      {children}
      {!loading && trailingIcon && (
        <span className="shrink-0" aria-hidden="true">
          {trailingIcon}
        </span>
      )}
    </button>
  )
}

export function Spinner() {
  return (
    <svg
      className="h-4 w-4 shrink-0 animate-spin"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="3"
        className="opacity-25"
      />
      <path
        d="M12 2a10 10 0 0 1 10 10"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  )
}

