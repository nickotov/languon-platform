import React from 'react'
import { motion } from 'framer-motion'
import { Clock3Icon, SparklesIcon } from 'lucide-react'
import { Button } from '../Button'

interface JobProgressProps {
  stage: 'queued' | 'translating'
  retranslate: boolean
  onCancel: () => void
}

/** Indeterminate progress — no fake percentages. */
export function JobProgress({ stage, retranslate, onCancel }: JobProgressProps) {
  return (
    <div className="rounded-2xl border border-border-default bg-background-surface p-5" role="status" aria-live="polite">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-subtle text-primary-default" aria-hidden>
          {stage === 'queued' ? <Clock3Icon className="h-5 w-5" /> : <SparklesIcon className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-text-primary">
            {stage === 'queued' ? 'Queued' : retranslate ? 'Creating a new translation…' : 'Translating the whole passage…'}
          </p>
          <p className="mt-1 text-sm leading-6 text-text-secondary">
            {stage === 'queued'
              ? 'Waiting for an available translator. This usually takes a few seconds.'
              : 'Each sentence is translated with the rest of the passage as context.'}
            {retranslate && ' Your saved version stays unchanged.'}
          </p>
        </div>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-progress-track" aria-hidden>
        <motion.div
          className="h-full w-1/3 rounded-full bg-progress-fill"
          animate={{ x: ['-100%', '300%'] }}
          transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
      <div className="mt-4 flex justify-end">
        <Button variant="secondary" size="compact" onClick={onCancel}>
          Cancel translation
        </Button>
      </div>
    </div>
  )
}
