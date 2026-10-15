import React, { useId, useRef } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { XIcon } from 'lucide-react'
import { IconButton } from '../IconButton'
import { useFocusTrap } from '../../hooks/useFocusTrap'

interface BottomSheetProps {
  open: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  footer?: React.ReactNode
  /** Disable dismissal while an action is in flight. */
  dismissible?: boolean
}

/** Phone sheet: fits 320–390px, traps focus, Escape to close, restores focus. */
export function BottomSheet({ open, onClose, title, children, footer, dismissible = true }: BottomSheetProps) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useFocusTrap(open, ref, dismissible ? onClose : undefined)

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50">
          <motion.div
            className="absolute inset-0 bg-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => dismissible && onClose()}
            aria-hidden
          />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            className="sheet-max-h absolute inset-x-0 bottom-0 flex flex-col rounded-t-2xl border-t border-border-default bg-background-surface shadow-lg focus:outline-none"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.25, ease: [0, 0, 0.2, 1] }}
          >
            <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-border-strong" aria-hidden />
            <div className="flex items-center justify-between gap-2 px-4 pb-2 pt-2">
              <h2 id={titleId} className="min-w-0 break-words text-base font-semibold text-text-primary">
                {title}
              </h2>
              {dismissible && <IconButton icon={<XIcon />} label="Close" variant="ghost" size="md" onClick={onClose} showTooltip={false} />}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">{children}</div>
            {footer && <div className="pb-safe border-t border-border-default px-4 pt-3">{footer}</div>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
