import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Hover-intent open/close for flyouts. Mouse hover opens after a short delay and
 * closes with a grace period so the pointer can travel into the panel. Click or
 * keyboard opens "pin" the panel so it only closes on explicit dismissal.
 * Touch and pen pointers never trigger hover behavior.
 */
export function useHoverIntent(openDelay = 180, closeDelay = 240) {
  const [open, setOpenState] = useState(false)
  const pinnedRef = useRef(false)
  const timer = useRef<number>()

  const clear = () => window.clearTimeout(timer.current)

  const setOpen = useCallback((next: boolean, pin = true) => {
    clear()
    pinnedRef.current = next ? pin : false
    setOpenState(next)
  }, [])

  const onPointerEnter = useCallback(
    (event: React.PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      clear()
      if (open) return
      timer.current = window.setTimeout(() => {
        pinnedRef.current = false
        setOpenState(true)
      }, openDelay)
    },
    [open, openDelay]
  )

  const onPointerLeave = useCallback(
    (event: React.PointerEvent) => {
      if (event.pointerType !== 'mouse') return
      clear()
      if (pinnedRef.current) return
      timer.current = window.setTimeout(() => setOpenState(false), closeDelay)
    },
    [closeDelay]
  )

  useEffect(() => clear, [])

  return {
    open,
    setOpen,
    isPinned: () => pinnedRef.current,
    hoverProps: { onPointerEnter, onPointerLeave }
  }
}

