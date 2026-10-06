import React, { useEffect, useRef, useState } from 'react'

interface PracticeShellProps {
  /** Gallery: render inside a bounded frame instead of covering the window. */
  contained?: boolean
  height?: number
  label: string
  header: React.ReactNode
  notice?: React.ReactNode
  children: React.ReactNode
  footer?: React.ReactNode
  overlay?: React.ReactNode
  onEscape?: () => void
}

/**
 * Full-window learning surface (100dvw × 100dvh) shared by dialog and full-screen
 * presentations. Sticky header and action bar; the middle scrolls. Height follows
 * the visual viewport so the draft and actions stay above an on-screen keyboard.
 */
export function PracticeShell({ contained = false, height = 680, label, header, notice, children, footer, overlay, onEscape }: PracticeShellProps) {
  const root = useRef<HTMLDivElement>(null)
  const [viewportHeight, setViewportHeight] = useState<number | null>(null)

  useEffect(() => {
    if (contained) return undefined
    const vv = window.visualViewport
    if (!vv) return undefined
    const update = () => setViewportHeight(vv.height)
    update()
    vv.addEventListener('resize', update)
    return () => vv.removeEventListener('resize', update)
  }, [contained])

  useEffect(() => {
    if (contained) return undefined
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    root.current?.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    return () => {
      document.body.style.overflow = previous
    }
  }, [contained])

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (contained) return
    if (event.key === 'Escape' && onEscape && !event.defaultPrevented) {
      event.preventDefault()
      onEscape()
    }
    if (event.key !== 'Tab' || !root.current) return
    const focusable = Array.from(
      root.current.querySelectorAll<HTMLElement>('button:not([disabled]), [href], textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'),
    ).filter((el) => el.offsetParent !== null)
    if (!focusable.length) return
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

  return (
    <div
      ref={root}
      role="dialog"
      aria-modal={contained ? undefined : true}
      aria-label={label}
      onKeyDown={onKeyDown}
      className={`${contained ? 'relative overflow-hidden rounded-2xl border border-border-default' : 'fixed left-0 top-0 z-40'} flex flex-col bg-background-canvas text-text-primary`}
      style={
        contained
          ? { height }
          : { width: '100dvw', height: viewportHeight ? `${viewportHeight}px` : '100dvh' }
      }
    >
      <header className="sticky top-0 z-20 border-b border-border-default bg-background-surface" style={{ paddingTop: contained ? undefined : 'env(safe-area-inset-top)' }}>
        <div className="mx-auto w-full max-w-5xl px-3 py-2.5 sm:px-6">{header}</div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-5 sm:px-6 md:py-8">
          {notice}
          {children}
        </div>
      </div>
      {footer ? (
        <footer
          className="border-t border-border-default bg-background-surface"
          style={{ paddingBottom: contained ? 'var(--spacing-12)' : 'max(var(--spacing-12), env(safe-area-inset-bottom))' }}
        >
          <div className="mx-auto w-full max-w-3xl px-4 pt-3 sm:px-6">{footer}</div>
        </footer>
      ) : null}
      {overlay}
    </div>
  )
}

