import React, { useState } from 'react'
import { ChevronDownIcon, ChevronUpIcon, SparklesIcon } from 'lucide-react'
import { Radio, RadioGroup } from '../Radio'
import { Button } from '../Button'
import { usePractice } from '../../contexts/PracticeContext'
import { useInterfaceText } from '../../hooks/useInterfaceText'
import { AI_MODELS } from '../../data/practiceSeeds'

/** Collapsed inline row in setup — expands in place, same preference as practice. No overlay. */
export function SetupAiSettings({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const { aiModel, setAiModel } = usePractice()
  const { P } = useInterfaceText()
  const [open, setOpen] = useState(defaultOpen)
  const [draft, setDraft] = useState(aiModel)
  const [saved, setSaved] = useState(false)
  const dirty = draft !== aiModel
  const current = AI_MODELS.find((m) => m.id === aiModel)

  return (
    <div className="rounded-xl border border-border-default">
      <button
        type="button"
        aria-expanded={open}
        aria-controls="setup-ai-settings"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-start hover:bg-background-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
      >
        <SparklesIcon aria-hidden className="h-4 w-4 shrink-0 text-text-secondary" />
        <span className="flex-1 text-sm font-semibold text-text-primary">{P('aiSettings')}</span>
        <span className="truncate text-xs text-text-secondary">{current?.label}</span>
        {open ? <ChevronUpIcon aria-hidden className="h-4 w-4" /> : <ChevronDownIcon aria-hidden className="h-4 w-4" />}
      </button>
      {open ? (
        <div id="setup-ai-settings" className="space-y-3 border-t border-border-default p-3">
          <p className="text-xs text-text-secondary">{P('aiSettingsDesc')}</p>
          <RadioGroup size="sm" label={P('aiSettings')} value={draft} onChange={(v) => { setDraft(v); setSaved(false) }}>
            {AI_MODELS.map((model) => (
              <Radio key={model.id} value={model.id} description={model.description}>
                {model.label}
              </Radio>
            ))}
          </RadioGroup>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="compact" variant="secondary" disabled={!dirty} onClick={() => { setAiModel(draft); setSaved(true) }}>
              {P('savePreference')}
            </Button>
            <span role="status" className="text-xs text-text-secondary">
              {dirty ? P('unsaved') : saved ? P('preferenceSaved') : ''}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  )
}

