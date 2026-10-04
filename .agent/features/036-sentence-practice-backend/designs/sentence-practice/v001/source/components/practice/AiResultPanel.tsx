import React, { useState } from 'react';
import { CheckCircle2Icon, ChevronDownIcon, ChevronUpIcon, CircleDashedIcon, InfoIcon, RepeatIcon, XCircleIcon } from 'lucide-react';
import { Badge } from '../Badge';
import { Button } from '../Button';
import type { AiAttempt, CorrectionKind, Rating } from '../../types/practice';
import { ratingLabel, segmentAnswer } from '../../utils/practiceGrading';
import { languageDir, languageName } from '../../data/languages';
const ratingIcon: Record<Rating, React.ReactNode> = {
  perfect: <CheckCircle2Icon aria-hidden className="h-5 w-5" />,
  good: <CheckCircle2Icon aria-hidden className="h-5 w-5" />,
  'not-bad': <CircleDashedIcon aria-hidden className="h-5 w-5" />,
  again: <RepeatIcon aria-hidden className="h-5 w-5" />
};
const ratingTone: Record<Rating, string> = {
  perfect: 'border-success-default text-success-default',
  good: 'border-success-default text-success-default',
  'not-bad': 'border-warning-default text-warning-default',
  again: 'border-border-strong text-text-secondary'
};
const kindLabel: Record<CorrectionKind, string> = {
  meaning: 'Meaning',
  grammar: 'Grammar',
  spelling: 'Spelling',
  vocabulary: 'Required word',
  punctuation: 'Punctuation'
};
interface AiResultPanelProps {
  attempt: AiAttempt;
  /** Start with expanded feedback (e.g. in history). */
  defaultExpanded?: boolean;
  compact?: boolean;
}
export function AiResultPanel({
  attempt,
  defaultExpanded = false,
  compact = false
}: AiResultPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const {
    result
  } = attempt;
  const segments = segmentAnswer(attempt.submittedAnswer, result.corrections);
  const numbered = result.corrections.map((correction, index) => ({
    correction,
    number: index + 1
  }));
  const numberFor = (id: string) => numbered.find(item => item.correction.id === id)?.number;
  const dir = languageDir(attempt.responseLanguage);
  return <section aria-label="AI check result" className="rounded-xl border border-border-default bg-background-surface p-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className={`inline-flex items-center gap-2 rounded-xl border-2 px-3 py-1.5 ${ratingTone[result.rating]}`}>
          {ratingIcon[result.rating]}
          <span className="text-xl font-semibold tabular-nums">{result.score}%</span>
        </div>
        <div className="min-w-0">
          <p className="text-base font-semibold text-text-primary" lang={result.explanationLanguage}>
            {ratingLabel(result.rating, result.explanationLanguage)}
          </p>
          <p className="text-xs text-text-tertiary">
            AI check · feedback in {languageName(result.explanationLanguage)}
          </p>
        </div>
        {attempt.assisted ? <Badge size="sm" tone="neutral" icon={<InfoIcon aria-hidden className="h-3.5 w-3.5" />}>
            Assisted — reference viewed first · grade unchanged
          </Badge> : null}
      </div>

      <p className="mt-3 text-sm leading-relaxed text-text-primary" lang={result.explanationLanguage} dir={languageDir(result.explanationLanguage)}>
        {result.explanation}
      </p>

      <div className="mt-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary">
          Your submitted answer
        </p>
        <p dir={dir} lang={attempt.responseLanguage} className="mt-1 whitespace-pre-wrap break-words rounded-lg border border-border-default bg-background-subtle p-3 text-base leading-relaxed text-text-primary">
          {segments.map((segment, index) => segment.correction ? <mark key={index} className="rounded-sm bg-warning-subtle text-text-primary underline decoration-warning-default decoration-wavy decoration-2 underline-offset-4">
                {segment.text}
                <sup className="ms-0.5 text-[10px] font-semibold text-warning-default">
                  {numberFor(segment.correction.id)}
                  <span className="sr-only"> (see correction {numberFor(segment.correction.id)})</span>
                </sup>
              </mark> : <span key={index}>{segment.text}</span>)}
        </p>
      </div>

      {numbered.length > 0 ? <div className="mt-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary">
            Corrections
          </p>
          <ol className="mt-1 space-y-2">
            {numbered.map(({
          correction,
          number
        }) => <li key={correction.id} className="flex gap-2 rounded-lg border border-border-default p-2.5 text-sm">
                <span className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-background-subtle text-xs font-semibold text-text-primary">
                  {number}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <Badge size="sm" tone="neutral">
                      {kindLabel[correction.kind]}
                    </Badge>
                    {correction.original ? <span dir={dir} lang={attempt.responseLanguage} className="text-text-primary">
                        <span className="line-through decoration-text-tertiary">{correction.original}</span>
                        {correction.suggestion ? <>
                            {' → '}
                            <span className="font-medium">{correction.suggestion}</span>
                          </> : null}
                      </span> : <span className="text-xs text-text-tertiary">Applies to the whole answer</span>}
                  </p>
                  <p className="mt-1 text-text-secondary" lang={result.explanationLanguage}>
                    {correction.note}
                  </p>
                </div>
              </li>)}
          </ol>
        </div> : <p className="mt-4 text-sm text-text-secondary">No corrections — nothing to change.</p>}

      <div className="mt-4">
        <p className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary">
          Target vocabulary
        </p>
        <ul className="mt-1 flex flex-wrap gap-2">
          {result.targets.map(target => <li key={target.targetId} className="inline-flex items-center gap-1.5 rounded-lg border border-border-default px-2 py-1 text-sm">
              {target.status === 'used' ? <CheckCircle2Icon aria-hidden className="h-4 w-4 text-success-default" /> : target.status === 'synonym' ? <div aria-hidden className="h-4 w-4 text-warning-default" /> : <XCircleIcon aria-hidden className="h-4 w-4 text-danger-default" />}
              <span lang={attempt.responseLanguage} className="font-medium text-text-primary">
                {target.hint}
              </span>
              <span className="text-text-secondary">
                {target.status === 'used' ? 'used' : target.status === 'synonym' ? `synonym used (“${target.note}”)` : 'missing'}
              </span>
            </li>)}
        </ul>
      </div>

      {result.improved || result.details.length > 0 ? <div className="mt-4">
          <Button size="compact" variant="secondary" aria-expanded={expanded} onClick={() => setExpanded(prev => !prev)} trailingIcon={expanded ? <ChevronUpIcon aria-hidden className="h-4 w-4" /> : <ChevronDownIcon aria-hidden className="h-4 w-4" />}>
            {expanded ? 'Hide details' : compact ? 'Details' : 'Improved translation and details'}
          </Button>
          {expanded ? <div className="mt-3 space-y-3">
              {result.improved ? <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-text-tertiary">
                    Improved translation
                  </p>
                  <p dir={dir} lang={attempt.responseLanguage} className="mt-1 text-base text-text-primary">
                    {result.improved}
                  </p>
                </div> : null}
              {result.details.length > 0 ? <ul className="list-disc space-y-1 ps-5 text-sm text-text-secondary" lang={result.explanationLanguage}>
                  {result.details.map(detail => <li key={detail}>{detail}</li>)}
                </ul> : null}
            </div> : null}
        </div> : null}

      <p className="mt-4 text-xs text-text-tertiary">
        A grade describes this answer only — it isn’t a measure of mastery.
      </p>
    </section>;
}
