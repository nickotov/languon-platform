import React from 'react';
import { ArrowRightIcon, XIcon, CheckIcon } from 'lucide-react';
import type { BlockVariant, GrammarBlock } from '../../../types/blocks';
import { PlayButton } from '../PlayButton';
import { bs } from '../../../data/blockStrings';

interface GrammarViewProps {
  block: GrammarBlock;
  variant: BlockVariant;
  scope: string;
}

const label = 'text-xs font-semibold uppercase tracking-wide text-text-tertiary';

/**
 * Teaching layout: rule → pattern → examples → common mistakes. Absent sections are hidden.
 * Compact keeps the rule's first sentence, the pattern and one example.
 */
export function GrammarView({ block, variant, scope }: GrammarViewProps) {
  const compact = variant === 'compact';
  const examples = compact ? block.examples.slice(0, 1) : block.examples;
  const rule = compact ? block.rule.split(/(?<=[.!?])\s/)[0] : block.rule;

  return (
    <div className={compact ? 'space-y-2 py-1' : 'space-y-4 py-1'}>
      {rule && <p className={`text-text-primary ${compact ? 'text-sm leading-6' : 'text-base leading-7'}`}>{rule}</p>}

      {block.pattern && (
        <div>
          {!compact && <p className={label}>{bs.grammar.pattern}</p>}
          <p lang="fr" className={`mt-1 inline-block rounded-lg bg-background-subtle px-3 py-1.5 font-mono text-text-primary ${compact ? 'text-xs' : 'text-sm'}`}>
            {block.pattern}
          </p>
        </div>
      )}

      {examples.length > 0 && (
        <div>
          {!compact && <p className={label}>{bs.grammar.examples}</p>}
          <ul className="mt-1 space-y-2">
            {examples.map((e) => (
              <li key={e.id} className="flex items-start gap-1.5">
                <div className="min-w-0 flex-1 border-l-2 border-primary-200 pl-3">
                  <p lang="fr" className="text-sm leading-6 text-text-primary">
                    {e.source}
                  </p>
                  <p lang="ru" className="text-sm leading-6 text-text-tertiary">
                    {e.translation}
                  </p>
                </div>
                {!compact && <PlayButton id={`${scope}:${e.id}`} text={e.source} label={bs.grammar.playExample} />}
              </li>
            ))}
          </ul>
        </div>
      )}

      {!compact && block.mistakes.length > 0 && (
        <div>
          <p className={label}>{bs.grammar.mistakes}</p>
          <ul className="mt-1 divide-y divide-border-default">
            {block.mistakes.map((m) => (
              <li key={m.id} className="py-2">
                <p lang="fr" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                  <span className="inline-flex items-center gap-1 text-danger-default line-through decoration-1">
                    <XIcon className="h-3.5 w-3.5 shrink-0 no-underline" aria-hidden="true" />
                    <span className="sr-only">{bs.grammar.wrong}: </span>
                    {m.wrong}
                  </span>
                  <ArrowRightIcon className="h-3.5 w-3.5 text-text-tertiary" aria-hidden="true" />
                  <span className="inline-flex items-center gap-1 font-medium text-success-default">
                    <CheckIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="sr-only">{bs.grammar.right}: </span>
                    {m.right}
                  </span>
                </p>
                <p className="mt-0.5 text-sm leading-6 text-text-secondary">{m.reason}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

