import React from 'react'
import { Radio, RadioGroup } from '../Radio'
import { Button } from '../Button'
import { InlineAlert } from '../InlineAlert'
import { AI_MODELS } from '../../data/practiceSeeds'

interface AiSettingsViewProps {
  savedModel: string
  value: string
  onChange: (value: string) => void
  onSave: () => void
  modelUnavailable: boolean
  pendingWork: boolean
  justSaved: boolean
}

/** Inline replacement view inside practice — not a second modal. */
export function AiSettingsView({ savedModel, value, onChange, onSave, modelUnavailable, pendingWork, justSaved }: AiSettingsViewProps) {
  const dirty = value !== savedModel
  return (
    <section aria-labelledby="ai-settings-title" className="space-y-5">
      <div>
        <h2 id="ai-settings-title" tabIndex={-1} className="text-xl font-semibold text-text-primary">AI settings</h2>
        <p className="mt-1 text-sm text-text-secondary">
          Your personal preference for AI checking and new sentences. Your exercise and answer stay exactly as they are.
        </p>
      </div>
      {modelUnavailable ? (
        <InlineAlert tone="info" title="Your selected model is unavailable right now">
          Choose another preference for future requests. Hints and the free reference comparison work either way.
        </InlineAlert>
      ) : null}
      {pendingWork ? (
        <p className="rounded-lg border border-border-default bg-background-subtle p-3 text-sm text-text-secondary">
          Work that’s already running keeps the preference it started with. A change applies to future requests only.
        </p>
      ) : null}
      <RadioGroup label="AI preference" value={value} onChange={onChange}>
        {AI_MODELS.map((model) => (
          <Radio key={model.id} value={model.id} description={model.description}>
            {model.label}
            {model.id === savedModel ? ' (current)' : ''}
          </Radio>
        ))}
      </RadioGroup>
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={onSave} disabled={!dirty}>Save preference</Button>
        <span role="status" className="text-sm text-text-secondary">
          {justSaved && !dirty ? 'Saved. Applies to your next AI request.' : dirty ? 'Unsaved change' : ''}
        </span>
      </div>
    </section>
  )
}

