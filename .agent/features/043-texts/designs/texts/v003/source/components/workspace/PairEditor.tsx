import React from 'react'
import { PencilLineIcon } from 'lucide-react'
import { Textarea } from '../Textarea'
import { languageName } from '../../utils/languages'
import type { WorkspaceController } from '../../hooks/useWorkspace'

function rowsFor(text: string) {
  return Math.min(8, Math.max(2, Math.ceil(text.length / 52)))
}

export function PairEditor({ ws, topSlot }: { ws: WorkspaceController; topSlot?: React.ReactNode }) {
  const src = languageName(ws.sourceLang)
  const tgt = languageName(ws.targetLang)
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto max-w-6xl space-y-4 px-4 py-6 sm:px-6 lg:px-8">
        {topSlot}
        <p className="text-sm leading-6 text-text-secondary">
          Edit either side of each pair. Pairs stay matched — you can’t split, merge, reorder or remove them. Changed pairs are
          marked “Edited after translation”; AI doesn’t review your edits.
        </p>
        <ol className="space-y-3">
          {ws.editBuffer.map((p, i) => {
            const edited = p.edited || ws.touched.has(p.id)
            const empty = ws.showErrors && ws.emptyPairIds.includes(p.id)
            return (
              <li
                key={p.id}
                className={`rounded-2xl border bg-background-surface p-4 ${edited ? 'border-warning-200' : 'border-border-default'}`}
                aria-label={`Sentence pair ${i + 1}`}
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-text-tertiary">Pair {i + 1}</span>
                  {edited && (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-warning-default">
                      <PencilLineIcon className="h-3.5 w-3.5" aria-hidden />
                      Edited after translation
                    </span>
                  )}
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  <Textarea
                    label={`Source · ${src}`}
                    lang={ws.sourceLang || undefined}
                    rows={rowsFor(p.source)}
                    resize="vertical"
                    value={p.source}
                    error={empty && !p.source.trim() ? 'This sentence can’t be empty.' : undefined}
                    onChange={(e) => ws.updatePair(p.id, 'source', e.target.value)}
                    className="text-base leading-7"
                  />
                  <Textarea
                    label={`Translation · ${tgt}`}
                    lang={ws.targetLang || undefined}
                    rows={rowsFor(p.target)}
                    resize="vertical"
                    value={p.target}
                    error={empty && !p.target.trim() ? 'The translation can’t be empty.' : undefined}
                    onChange={(e) => ws.updatePair(p.id, 'target', e.target.value)}
                    className="text-base leading-7"
                  />
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    </div>
  )
}
