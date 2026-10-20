import React, {
  cloneElement,
  isValidElement,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { AnimatePresence, motion } from 'framer-motion'

export type TooltipPlacement = 'top' | 'bottom' | 'left' | 'right'

export interface TooltipProps {
  /** Text or node shown inside the tooltip bubble. */
  content: React.ReactNode
  /** The trigger element. Must accept a ref and DOM event handlers. */
  children: React.ReactElement
  /** Side of the trigger the tooltip appears on. Defaults to 'top'. */
  placement?: TooltipPlacement
  /** Delay in ms before showing on hover. Defaults to 150. */
  delay?: number
  /** Renders the small pointer arrow. Defaults to true. */
  withArrow?: boolean
  /** Disables the tooltip entirely; the trigger renders untouched. */
  disabled?: boolean
  /** Force the tooltip open (useful for previews and docs). */
  open?: boolean
  /** Extra classes applied to the tooltip bubble. */
  className?: string
}

/**
 * Positioning lives on a static wrapper (not the animated bubble) because
 * framer-motion writes an inline `transform`, which would otherwise clobber
 * the `-translate-x-1/2` / `-translate-y-1/2` centering classes and leave the
 * tooltip offset from its trigger.
 */
const PLACEMENT_CLASSES: Record<TooltipPlacement, string> = {
  top: 'bottom-full left-1/2 -translate-x-1/2 pb-[var(--spacing-8)]',
  bottom: 'top-full left-1/2 -translate-x-1/2 pt-[var(--spacing-8)]',
  left: 'right-full top-1/2 -translate-y-1/2 pr-[var(--spacing-8)]',
  right: 'left-full top-1/2 -translate-y-1/2 pl-[var(--spacing-8)]',
}

const ARROW_CLASSES: Record<TooltipPlacement, string> = {
  top: 'top-full left-1/2 -translate-x-1/2 -translate-y-1/2',
  bottom: 'bottom-full left-1/2 -translate-x-1/2 translate-y-1/2',
  left: 'left-full top-1/2 -translate-y-1/2 -translate-x-1/2',
  right: 'right-full top-1/2 -translate-y-1/2 translate-x-1/2',
}

const OFFSET: Record<TooltipPlacement, { x: number; y: number }> = {
  top: { x: 0, y: 4 },
  bottom: { x: 0, y: -4 },
  left: { x: 4, y: 0 },
  right: { x: -4, y: 0 },
}

export function Tooltip({
  content,
  children,
  placement = 'top',
  delay = 150,
  withArrow = true,
  disabled = false,
  open,
  className = '',
}: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tooltipId = useId()

  const clear = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
    }
  }, [])

  useEffect(() => clear, [clear])

  const show = useCallback(
    (immediate = false) => {
      clear()
      if (immediate || delay <= 0) {
        setVisible(true)
        return
      }
      timer.current = setTimeout(() => setVisible(true), delay)
    },
    [clear, delay],
  )

  const hide = useCallback(() => {
    clear()
    setVisible(false)
  }, [clear])

  useEffect(() => {
    if (!visible) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [visible, hide])

  if (disabled || !content || !isValidElement(children)) {
    return children
  }

  const isOpen = open ?? visible

  const trigger = cloneElement(children, {
    'aria-describedby': isOpen ? tooltipId : undefined,
    onMouseEnter: (event: React.MouseEvent) => {
      children.props.onMouseEnter?.(event)
      show()
    },
    onMouseLeave: (event: React.MouseEvent) => {
      children.props.onMouseLeave?.(event)
      hide()
    },
    onFocus: (event: React.FocusEvent) => {
      children.props.onFocus?.(event)
      show(true)
    },
    onBlur: (event: React.FocusEvent) => {
      children.props.onBlur?.(event)
      hide()
    },
  } as Partial<Record<string, unknown>>)

  return (
    <span className="relative inline-flex">
      {trigger}
      <AnimatePresence>
        {isOpen && (
          <span
            className={`pointer-events-none absolute z-50 ${PLACEMENT_CLASSES[placement]}`}
          >
            <motion.span
              id={tooltipId}
              role="tooltip"
              initial={{ opacity: 0, scale: 0.96, ...OFFSET[placement] }}
              animate={{ opacity: 1, scale: 1, x: 0, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, ...OFFSET[placement] }}
              transition={{ duration: 0.12, ease: [0.4, 0, 0.2, 1] }}
              className={[
                'relative block whitespace-nowrap',
                'rounded-[var(--radius-sm)] bg-neutral-900 px-[var(--spacing-8)] py-[var(--spacing-4)]',
                'font-body text-xs font-medium leading-5 text-neutral-50',
                'shadow-[var(--elevation-md)]',
                className,
              ]
                .filter(Boolean)
                .join(' ')}
            >
              {content}
              {withArrow && (
                <span
                  aria-hidden="true"
                  className={`absolute h-2 w-2 rotate-45 bg-neutral-900 ${ARROW_CLASSES[placement]}`}
                />
              )}
            </motion.span>
          </span>
        )}
      </AnimatePresence>
    </span>
  )
}

