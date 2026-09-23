import React, { forwardRef, useId } from 'react'

export type InputSize = 'sm' | 'md' | 'lg'

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Visible label rendered above the field. */
  label?: string
  /** Helper text rendered below the field. Hidden when `error` is set. */
  hint?: string
  /** Error message. Presence switches the field into its error state. */
  error?: string
  /** Control height / typography scale. */
  size?: InputSize
  /** Element rendered inside the field, before the text. */
  leadingIcon?: React.ReactNode
  /** Element rendered inside the field, after the text. */
  trailingIcon?: React.ReactNode
  /** Stretch the field to the full width of its container. */
  fullWidth?: boolean
  /** Class applied to the outer wrapper element. */
  wrapperClassName?: string
}

const sizeStyles: Record<InputSize, string> = {
  sm: 'h-8 text-sm',
  md: 'h-10 text-sm',
  lg: 'h-12 text-base',
}

const paddingStyles: Record<InputSize, string> = {
  sm: 'px-2.5',
  md: 'px-3',
  lg: 'px-3.5',
}

const iconSizeStyles: Record<InputSize, string> = {
  sm: 'w-8',
  md: 'w-10',
  lg: 'w-11',
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  {
    label,
    hint,
    error,
    size = 'md',
    leadingIcon,
    trailingIcon,
    fullWidth = true,
    wrapperClassName = '',
    className = '',
    disabled = false,
    required = false,
    id,
    ...props
  },
  ref,
) {
  const generatedId = useId()
  const inputId = id ?? `input-${generatedId}`
  const messageId = `${inputId}-message`
  const hasError = Boolean(error)
  const message = error || hint

  const fieldClasses = [
    'peer block w-full rounded-md border bg-white text-slate-900 transition-colors',
    'placeholder:text-slate-400',
    'focus:outline-none focus:ring-2 focus:ring-offset-0',
    'disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400 disabled:border-slate-200 disabled:placeholder:text-slate-300',
    sizeStyles[size],
    leadingIcon ? 'pl-9' : paddingStyles[size],
    trailingIcon ? 'pr-9' : paddingStyles[size],
    hasError
      ? 'border-red-500 focus:border-red-500 focus:ring-red-200'
      : 'border-slate-300 hover:border-slate-400 focus:border-slate-900 focus:ring-slate-200',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={[fullWidth ? 'w-full' : 'inline-block', wrapperClassName]
        .filter(Boolean)
        .join(' ')}
    >
      {label ? (
        <label
          htmlFor={inputId}
          className={[
            'mb-1.5 block text-sm font-medium',
            disabled ? 'text-slate-400' : 'text-slate-700',
          ].join(' ')}
        >
          {label}
          {required ? (
            <span className="ml-0.5 text-red-500" aria-hidden="true">
              *
            </span>
          ) : null}
        </label>
      ) : null}

      <div className="relative">
        {leadingIcon ? (
          <span
            aria-hidden="true"
            className={[
              'pointer-events-none absolute inset-y-0 left-0 flex items-center justify-center',
              iconSizeStyles[size],
              disabled ? 'text-slate-300' : 'text-slate-400',
            ].join(' ')}
          >
            {leadingIcon}
          </span>
        ) : null}

        <input
          {...props}
          id={inputId}
          ref={ref}
          disabled={disabled}
          required={required}
          aria-invalid={hasError || undefined}
          aria-describedby={message ? messageId : undefined}
          className={fieldClasses}
        />

        {trailingIcon ? (
          <span
            aria-hidden="true"
            className={[
              'pointer-events-none absolute inset-y-0 right-0 flex items-center justify-center',
              iconSizeStyles[size],
              disabled ? 'text-slate-300' : 'text-slate-400',
            ].join(' ')}
          >
            {trailingIcon}
          </span>
        ) : null}
      </div>

      {message ? (
        <p
          id={messageId}
          role={hasError ? 'alert' : undefined}
          className={[
            'mt-1.5 text-xs',
            hasError ? 'text-red-600' : 'text-slate-500',
          ].join(' ')}
        >
          {message}
        </p>
      ) : null}
    </div>
  )
})

