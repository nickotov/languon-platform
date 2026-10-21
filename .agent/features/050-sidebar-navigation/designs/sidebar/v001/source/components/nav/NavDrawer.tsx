import React, { useEffect, useRef } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { XIcon } from 'lucide-react'
import { Logo } from '../Logo'
import { IconButton } from '../IconButton'
import { AccountMenu } from './AccountMenu'
import { CreateMenu } from './CreateMenu'
import { SearchTrigger } from './SearchTrigger'
import { SidebarNavList } from './SidebarNavList'
import { usePreferences } from '../../contexts/PreferencesContext'

type NavDrawerProps = {
  open: boolean
  onClose: () => void
  showPlanned: boolean
}

/** Full-height, dismissible navigation drawer for mobile and tablet. Touch-first (44px rows). */
export function NavDrawer({ open, onClose, showPlanned }: NavDrawerProps) {
  const { t } = usePreferences()
  const reduceMotion = useReducedMotion()
  const panelRef = useRef<HTMLDivElement>(null)
  const restoreFocus = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (!open) return
    restoreFocus.current = document.activeElement as HTMLElement | null
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const frame = requestAnimationFrame(() => panelRef.current?.querySelector<HTMLElement>('button, a')?.focus())

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !document.querySelector('[data-radix-popper-content-wrapper]')) onClose()
      if (event.key !== 'Tab' || !panelRef.current) return
      const focusable = panelRef.current.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input')
      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      cancelAnimationFrame(frame)
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', onKeyDown)
      restoreFocus.current?.focus?.()
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-40">
          <motion.div
            className="absolute inset-0 bg-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={t('nav.label')}
            className="absolute inset-y-0 left-0 flex w-80 max-w-full flex-col bg-background-subtle shadow-elevation-lg"
            initial={reduceMotion ? { opacity: 0 } : { x: '-100%' }}
            animate={reduceMotion ? { opacity: 1 } : { x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { x: '-100%' }}
            transition={{ duration: 0.24, ease: [0, 0, 0.2, 1] }}
          >
            <div className="flex h-14 items-center justify-between pl-4 pr-2">
              <Logo variant="lockup" size="sm" />
              <IconButton variant="ghost" icon={<XIcon />} label={t('mobile.closeMenu')} showTooltip={false} onClick={onClose} />
            </div>
            <div className="flex items-center gap-2 px-3 pb-3">
              <SearchTrigger touch />
              <CreateMenu variant="touch" />
            </div>
            <nav aria-label={t('nav.label')} className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
              <SidebarNavList showPlanned={showPlanned} touch onNavigate={onClose} />
            </nav>
            <div className="border-t border-border-default p-2">
              <AccountMenu variant="expanded" onNavigate={onClose} />
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

