import React from 'react'
import { ArrowRightIcon, CheckIcon, RefreshCwIcon, ScanSearchIcon, XIcon } from 'lucide-react'
import { Button } from '../Button'
import { IconButton } from '../IconButton'
import { Select } from '../Select'
import { Switch } from '../Switch'
import { languages } from '../../data/languages'
import { languageName } from '../../utils/languages'
import type { WorkspaceController } from '../../hooks/useWorkspace'
import type { LanguageCode } from '../../types/texts'

const options = languages.map((l) => ({ label: l.name, value: l.code }))

export function LanguageBar({ ws }: { ws: WorkspaceController }) {
  const editable = ws.phase === 'compose'
  const canMatch = ws.phase === 'read' || ws.phase === 'preview' || ws.phase === 'proposal'

  if (!editable) {
    return (
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border-default bg-background-surface px-4 py-2 sm:px-6">
        <p className="inline-flex items-center gap-2 text-sm font-medium text-text-primary">
          {languageName(ws.sourceLang)}
          <ArrowRightIcon className="h-4 w-4 text-text-tertiary" aria-label="to" />
          {languageName(ws.targetLang)}
        </p>
        {canMatch ? (
          <Switch
            size="sm"
            label={ws.matchMode ? 'Match sentences · On' : 'Match sentences'}
            checked={ws.matchMode}
            onCheckedChange={ws.setMatchMode}
          />
        ) : ws.phase === 'edit' ? (
          <p className="text-xs text-text-secondary">Editing sentence pairs — pairs stay matched.</p>
        ) : null}
      </div>
    )
  }

  const err = ws.showErrors ? ws.errors : { sourceLang: '', targetLang: '' }
  const d = ws.detect

  return (
    <div className="shrink-0 border-b border-border-default bg-background-surface px-4 py-3 sm:px-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-start">
        <div className="min-w-0 flex-1 md:max-w-xs">
          <Select
            label="Source language"
            fullWidth
            size="md"
            placeholder="Choose language"
            options={options}
            value={ws.sourceLang}
            error={err.sourceLang || undefined}
            onChange={(e) => ws.setSourceLang(e.target.value as LanguageCode)}
          />
        </div>
        <div className="md:pt-6">
          {d.status === 'idle' || d.status === 'detecting' ? (
            <Button
              variant="secondary"
              loading={d.status === 'detecting'}
              disabled={!ws.sourceText.trim()}
              onClick={ws.runDetect}
              leadingIcon={<ScanSearchIcon className="h-4 w-4" />}
              title={!ws.sourceText.trim() ? 'Add some text first' : undefined}
            >
              {d.status === 'detecting' ? 'Detecting…' : 'Detect language'}
            </Button>
          ) : (
            <div className="flex min-h-11 flex-wrap items-center gap-2 rounded-xl border border-border-default bg-background-subtle py-1 pl-3 pr-1 text-sm" role="status" aria-live="polite">
              {d.status === 'suggested' && (
                <>
                  <span className="text-text-secondary">
                    Looks like <span className="font-medium text-text-primary">{languageName(d.lang)}</span>
                  </span>
                  {ws.sourceLang === d.lang ? (
                    <span className="inline-flex items-center gap-1 text-success-default">
                      <CheckIcon className="h-4 w-4" aria-hidden /> Matches your choice
                    </span>
                  ) : (
                    <Button size="compact" variant="secondary" onClick={ws.acceptDetected}>
                      Use this language
                    </Button>
                  )}
                </>
              )}
              {d.status === 'low' && (
                <>
                  <span className="text-text-secondary">
                    Not sure — maybe <span className="font-medium text-text-primary">{languageName(d.lang)}</span>. Please check.
                  </span>
                  <Button size="compact" variant="ghost" onClick={ws.acceptDetected}>
                    Use {languageName(d.lang)}
                  </Button>
                </>
              )}
              {d.status === 'failed' && (
                <>
                  <span className="text-text-secondary">Couldn’t detect the language.</span>
                  <Button size="compact" variant="ghost" onClick={ws.runDetect} leadingIcon={<RefreshCwIcon className="h-4 w-4" />}>
                    Retry
                  </Button>
                </>
              )}
              <IconButton icon={<XIcon />} label="Dismiss suggestion" variant="ghost" size="sm" onClick={() => ws.setDetect({ status: 'idle' })} />
            </div>
          )}
        </div>
        <ArrowRightIcon className="hidden h-5 w-5 shrink-0 text-text-tertiary md:mt-9 md:block" aria-hidden />
        <div className="min-w-0 flex-1 md:max-w-xs">
          <Select
            label="Translation language"
            fullWidth
            placeholder="Choose language"
            options={options}
            value={ws.targetLang}
            error={err.targetLang || undefined}
            onChange={(e) => ws.setTargetLang(e.target.value as LanguageCode)}
          />
        </div>
      </div>
      <p className="mt-2 text-xs text-text-tertiary">Choose both languages yourself. Detection only suggests — it never changes your choice.</p>
    </div>
  )
}
