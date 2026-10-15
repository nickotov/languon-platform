import { RefObject, useEffect, useRef } from 'react'

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])'

/** Traps Tab focus inside `ref`, handles Escape, and restores focus on close. */
export function useFocusTrap(active: boolean, ref: RefObject<HTMLElement>, onEscape?: () => void) {
  const escRef = useRef(onEscape)
  escRef.current = onEscape

  useEffect(() => {
    const node = ref.current
    if (!active || !node) return
    const previously = document.activeElement as HTMLElement | null
    const list = () =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null)
    const first = list()[0]
    ;(first ?? node).focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && escRef.current) {
        e.stopPropagation()
        escRef.current()
        return
      }
      if (e.key !== 'Tab') return
      const items = list()
      if (!items.length) return
      const a = items[0]
      const b = items[items.length - 1]
      if (e.shiftKey && document.activeElement === a) {
        e.preventDefault()
        b.focus()
      } else if (!e.shiftKey && document.activeElement === b) {
        e.preventDefault()
        a.focus()
      }
    }
    node.addEventListener('keydown', onKey)
    return () => {
      node.removeEventListener('keydown', onKey)
      previously?.focus?.()
    }
  }, [active, ref])
}
