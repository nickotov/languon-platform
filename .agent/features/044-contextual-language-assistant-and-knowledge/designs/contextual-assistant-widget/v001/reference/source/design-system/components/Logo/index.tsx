import React from 'react'

export type LogoSize = 'sm' | 'md' | 'lg'
export type LogoVariant = 'wordmark' | 'monogram' | 'lockup'

export interface LogoProps {
  /** Brand name rendered as the wordmark. */
  name?: string
  /** Visual size of the mark. */
  size?: LogoSize
  /** Which form of the placeholder mark to render. */
  variant?: LogoVariant
  /** Optional link target. When set, the logo renders as an anchor. */
  href?: string
  /** Accessible label. Defaults to `${name} home`. */
  label?: string
  className?: string
}

const wordmarkSize: Record<LogoSize, string> = {
  sm: 'text-base',
  md: 'text-xl',
  lg: 'text-3xl',
}

const monogramSize: Record<LogoSize, string> = {
  sm: 'h-6 w-6 text-xs',
  md: 'h-8 w-8 text-sm',
  lg: 'h-11 w-11 text-lg',
}

const gapSize: Record<LogoSize, string> = {
  sm: 'gap-2',
  md: 'gap-2.5',
  lg: 'gap-3',
}

/** Uses the design system's heading type family, falling back to the body family. */
const headingFont = { fontFamily: 'var(--font-heading, var(--font-body, inherit))' }

export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[words.length - 1][0]).toUpperCase()
}

export function Logo({
  name = 'Languon',
  size = 'md',
  variant = 'wordmark',
  href,
  label,
  className = '',
}: LogoProps) {
  const showMonogram = variant === 'monogram' || variant === 'lockup'
  const showWordmark = variant === 'wordmark' || variant === 'lockup'

  const content = (
    <>
      {showMonogram && (
        <span
          aria-hidden="true"
          className={`inline-flex shrink-0 items-center justify-center rounded-md bg-neutral-900 font-semibold uppercase leading-none tracking-tight text-white ${monogramSize[size]}`}
          style={headingFont}
        >
          {getInitials(name)}
        </span>
      )}
      {showWordmark && (
        <span
          className={`font-semibold leading-none tracking-tight text-neutral-900 ${wordmarkSize[size]}`}
          style={headingFont}
        >
          {name}
        </span>
      )}
    </>
  )

  const base = `inline-flex items-center ${gapSize[size]} ${className}`

  if (href) {
    return (
      <a
        href={href}
        aria-label={label ?? `${name} home`}
        className={`${base} rounded-md no-underline transition-opacity hover:opacity-80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2`}
      >
        {content}
      </a>
    )
  }

  return (
    <span role="img" aria-label={label ?? name} className={base}>
      {content}
    </span>
  )
}

