import React, { forwardRef } from 'react'
import { AlertCircleIcon, LanguagesIcon, WandSparklesIcon } from 'lucide-react'
import { Button } from '../Button'
import { Input } from '../Input'
import { Tabs } from '../Tabs'
import { Textarea } from '../Textarea'
import { JobErrorAlert } from './JobErrorAlert'
import { JobProgress } from './JobProgress'
import { samplePassage } from '../../data/samplePassages'
import { languageName } from '../../utils/languages'
import { formatCount } from '../../utils/sentences'
import { MAX_CHARS } from '../../hooks/useWorkspace'
import type { WorkspaceController } from '../../hooks/useWorkspace'
import type { Side } from '../../types/texts'

interface ComposePaneProps {
  ws: WorkspaceController
  compact: boolean
}

export const ComposePane = forwardRef<HTMLTextAreaElement, ComposePaneProps>(function ComposePane({ ws, compact }, ref) {
  const over = ws.charCount > MAX_CHARS
  const textError = ws.showErrors && ws.errors.text ? ws.errors.text : over ? ws.errors.text : ''
  const locked = ws.phase === 'job'

  const source = (
    <div className="flex flex-col gap-4">
      <Input
        label="Title"
        value={ws.title}
        maxLength={160}
        disabled={locked}
        placeholder="Optional"
        hint="If you leave this empty, the first line of the text becomes the title."
        onChange={(e) => ws.setTitle(e.target.value)}
      />
      <div>
        <Textarea
          ref={ref}
          label={`Source text${ws.sourceLang ? ` · ${languageName(ws.sourceLang)}` : ''}`}
          rows={compact ? 10 : 16}
          resize="vertical"
          disabled={locked}
          lang={ws.sourceLang || undefined}
          placeholder="Paste or type a passage. Paragraph breaks and punctuation are kept exactly."
          value={ws.sourceText}
          error={textError || undefined}
          onChange={(e) => ws.setSourceText(e.target.value)}
          className="text-base leading-7"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          {!ws.sourceText && !locked ? (
            <button
              type="button"
              onClick={() => ws.setSourceText(samplePassage)}
              className="min-h-11 rounded-lg text-sm font-medium text-primary-default hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-border-focus"
            >
              Try a sample passage
            </button>
          ) : (
            <span />
          )}
          <span className={`inline-flex items-center gap-1 text-xs ${over ? 'font-semibold text-danger-default' : 'text-text-tertiary'}`} aria-live="polite">
            {over && <AlertCircleIcon className="h-3.5 w-3.5" aria-hidden />}
            {formatCount(ws.charCount)} / {formatCount(MAX_CHARS)} characters
          </span>
        </div>
      </div>
    </div>
  )

  const translation = (
    <div className="flex flex-col gap-4">
      {ws.phase === 'job' && ws.job && (
        <JobProgress stage={ws.job.stage} retranslate={false} onCancel={ws.cancelJob} />
      )}
      {ws.jobError && ws.jobError.during === 'translate' && (
        <JobErrorAlert
          kind={ws.jobError.kind}
          during="translate"
          onRetry={() => ws.startJob('translate')}
          onExtendedModel={() => ws.startJob('translate', true)}
          onEditText={() => {
            ws.setJobError(null)
            if (compact) ws.setMobileTab('source')
          }}
          onDismiss={() => ws.setJobError(null)}
        />
      )}
      {ws.phase !== 'job' && (
        <div className="flex flex-col items-center rounded-2xl border border-dashed border-border-strong bg-background-surface px-6 py-12 text-center">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-background-subtle text-text-secondary" aria-hidden>
            <LanguagesIcon className="h-5 w-5" />
          </div>
          <p className="mt-3 text-sm font-semibold text-text-primary">
            Translation{ws.targetLang ? ` · ${languageName(ws.targetLang)}` : ''}
          </p>
          <p className="mt-1 max-w-sm text-sm leading-6 text-text-secondary">
            The result appears here after Translate via AI. The whole passage is translated together, so each sentence keeps its
            context.
          </p>
          {compact && (
            <Button className="mt-4" onClick={() => ws.startJob('translate')} leadingIcon={<WandSparklesIcon className="h-4 w-4" />}>
              Translate via AI
            </Button>
          )}
        </div>
      )}
    </div>
  )

  if (compact) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="sticky top-0 z-10 border-b border-border-default bg-background-canvas px-3 py-2">
          <Tabs
            variant="segmented"
            size="sm"
            fullWidth
            aria-label="Source or translation"
            value={ws.mobileTab}
            onValueChange={(v) => ws.setMobileTab(v as Side)}
            items={[
              { value: 'source', label: <span className="truncate">Source · {languageName(ws.sourceLang) }</span> },
              { value: 'target', label: <span className="truncate">Translation · {languageName(ws.targetLang)}</span> },
            ]}
          />
        </div>
        <div className="px-4 py-4">{ws.mobileTab === 'source' ? source : translation}</div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-10 px-8 py-8">
        <section aria-label="Source">{source}</section>
        <section aria-label="Translation" className="pt-0">
          {translation}
        </section>
      </div>
    </div>
  )
})
