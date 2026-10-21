import React from 'react';
import { InboxIcon } from 'lucide-react';
import type { LangCode, PortraitItems } from '../../types/portrait';
import { generateSummary, summaryWordCount } from '../../utils/summary';
import { countItems } from '../../utils/portraitItems';
import { INTERVIEW_LANGUAGES } from '../../data/portraitOptions';

interface SummaryPanelProps {
  items: PortraitItems;
  language: LangCode;
  title?: string;
  compact?: boolean;
  headingLevel?: 'h2' | 'h3';
}

export function SummaryPanel({ items, language, title = 'Portrait summary', compact, headingLevel = 'h2' }: SummaryPanelProps) {
  const paragraphs = generateSummary(items, language);
  const count = countItems(items);
  const wordCount = summaryWordCount(paragraphs);
  const Heading = headingLevel;
  const langLabel = INTERVIEW_LANGUAGES.find((l) => l.value === language)?.english ?? 'English';
  const headingId = React.useId();

  return (
    <section aria-labelledby={headingId} className={compact ? '' : 'rounded-2xl border border-border-default bg-background-surface p-4 sm:p-6'}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <Heading id={headingId} className="text-base font-semibold text-text-primary">
          {title}
        </Heading>
        {count > 0 && <span className="text-xs text-text-tertiary">Written in {langLabel} · updates as you edit</span>}
      </div>
      {count === 0 ? (
        <div className="flex items-start gap-3 rounded-xl bg-background-subtle p-4">
          <InboxIcon className="mt-0.5 h-5 w-5 shrink-0 text-text-tertiary" aria-hidden="true" />
          <div>
            <p className="font-medium text-text-primary">Nothing to save yet</p>
            <p className="mt-1 text-sm text-text-secondary">
              Add at least one item — a language, goal, or preference — and a summary will appear here. We won’t invent one for you.
            </p>
          </div>
        </div>
      ) : (
        <div aria-live="polite" className="max-w-prose space-y-3 text-base leading-relaxed text-text-primary">
          {paragraphs.map((p, i) => (
            <p key={i}>{p}</p>
          ))}
          {wordCount < 60 && (
            <p className="text-sm text-text-secondary">This is a short portrait, and that’s fine. You can add more anytime.</p>
          )}
        </div>
      )}
    </section>
  );
}

