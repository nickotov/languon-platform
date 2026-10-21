import React, { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { SendIcon, SparklesIcon, XIcon } from 'lucide-react'
import { AiTutorMessage } from './AiTutorMessage'
import { UserMessage } from './UserMessage'
import { IconButton } from './IconButton'
import { usePreferences } from '../contexts/PreferencesContext'
import { aiConversation } from '../data/resources'

type AiChatPanelProps = {
  open: boolean
  onClose: () => void
  /** docked: shares width with the editor (desktop). sheet: overlays from the right (tablet/mobile). */
  variant: 'docked' | 'sheet'
}

export function AiChatPanel({ open, onClose, variant }: AiChatPanelProps) {
  const reduceMotion = useReducedMotion()

  if (variant === 'docked') {
    if (!open) return null
    return (
      <aside className="flex h-full w-96 shrink-0 flex-col border-l border-border-default bg-background-surface">
        <PanelBody onClose={onClose} />
      </aside>
    )
  }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-30">
          <motion.div className="absolute inset-0 bg-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose} aria-hidden="true" />
          <motion.aside
            role="dialog"
            aria-modal="true"
            className="absolute inset-y-0 right-0 flex w-full flex-col bg-background-surface shadow-elevation-lg sm:w-96"
            initial={reduceMotion ? { opacity: 0 } : { x: '100%' }}
            animate={reduceMotion ? { opacity: 1 } : { x: 0 }}
            exit={reduceMotion ? { opacity: 0 } : { x: '100%' }}
            transition={{ duration: 0.24, ease: [0, 0, 0.2, 1] }}
          >
            <PanelBody onClose={onClose} />
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  )
}

function PanelBody({ onClose }: { onClose: () => void }) {
  const { t } = usePreferences()
  const [draft, setDraft] = useState('')

  return (
    <>
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border-default pl-4 pr-2">
        <SparklesIcon className="h-4 w-4 text-primary-default" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-semibold text-text-primary">{t('ai.title')}</h2>
          <p className="truncate text-xs text-text-tertiary">{t('ai.context')}</p>
        </div>
        <IconButton variant="ghost" size="sm" icon={<XIcon />} label={t('ai.close')} tooltipPlacement="left" onClick={onClose} />
      </div>
      <div role="log" aria-live="polite" className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        <div role="list" className="space-y-4">
          {aiConversation.map((message, index) =>
            message.role === 'user' ? (
              <UserMessage key={index} text={message.text} />
            ) : (
              <div role="listitem" key={index}>
                <AiTutorMessage tutorName="Languon AI" message={message.text} />
              </div>
            )
          )}
        </div>
      </div>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          setDraft('')
        }}
        className="shrink-0 border-t border-border-default p-3"
      >
        <div className="flex items-end gap-2 rounded-xl border border-border-default bg-background-canvas p-2 focus-within:ring-2 focus-within:ring-border-focus">
          <label htmlFor="ai-input" className="sr-only">{t('ai.placeholder')}</label>
          <textarea
            id="ai-input"
            rows={2}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder={t('ai.placeholder')}
            className="min-w-0 flex-1 resize-none bg-transparent px-1 text-sm text-text-primary outline-none placeholder:text-text-tertiary"
          />
          <IconButton type="submit" variant="primary" size="sm" icon={<SendIcon />} label={t('ai.send')} disabled={!draft.trim()} />
        </div>
      </form>
    </>
  )
}

