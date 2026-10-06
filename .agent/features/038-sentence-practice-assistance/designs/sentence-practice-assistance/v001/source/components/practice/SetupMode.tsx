import React from 'react'
import { Radio, RadioGroup } from '../Radio'
import type { PracticeMode } from '../../types/practice'

interface SetupModeProps {
  mode: PracticeMode
  onModeChange: (mode: PracticeMode) => void
  savedCount: number
  practisedBefore: boolean
  refreshing: boolean
  directionLabel: string
}

export function SetupMode({ mode, onModeChange, savedCount, practisedBefore, refreshing, directionLabel }: SetupModeProps) {
  return (
    <div className="space-y-2">
      <RadioGroup size="sm" label="Practice mode" value={mode} onChange={(value) => onModeChange(value as PracticeMode)}>
        <Radio value="saved-first" description="Reuses saved examples first — including ones you’ve already checked or reviewed — then prepares new ones only for words still missing.">
          Saved first
        </Radio>
        <Radio value="new" description="Prepares fresh sentences. Earlier examples and your history are kept.">
          New examples
        </Radio>
        <Radio value="review" description="Saved examples only. Never generates.">
          Review saved
        </Radio>
      </RadioGroup>
      <p role="status" className="text-xs text-text-secondary">
        {refreshing
          ? 'Updating saved examples for this setup…'
          : savedCount === 0
            ? `No saved examples yet for ${directionLabel} with these words.`
            : `${savedCount} saved ${savedCount === 1 ? 'example' : 'examples'} for this setup.`}
        {practisedBefore && mode === 'saved-first' && savedCount > 0 ? ' You’ve practised here before — saved examples come first, nothing switches to fresh generation on its own.' : ''}
      </p>
    </div>
  )
}

