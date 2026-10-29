import React, { useEffect, useRef, useState } from 'react';
import { ChevronDownIcon } from 'lucide-react';
import type { BlockVariant, VocabularyBlock, VocabEntry as VocabularyEntry } from '../../../types/blocks';
import { PlayButton } from '../PlayButton';
import { ru } from '../../../data/strings';

interface VocabularyViewProps {
  block: VocabularyBlock;
  variant: BlockVariant;
  /** Unique prefix so the same entry in chat and sheet are separate playback targets. */
  scope: string;
  /** Compact previews show this many rows before "+ N more". */
  limit?: number;
  /** Driven by the block's settings menu ("Show / Hide all translations"). */
  expandAll?: { open: boolean; at: number };
}

/** Lists longer than this switch to two columns when the block is wide enough. */
const TWO_COLUMN_MIN_ENTRIES = 11;
const TWO_COLUMN_MIN_WIDTH = 560;

/**
 * One information hierarchy in every context: term (+ play, transcription) → translation → details.
 * - Compact chat preview: source/translation pairs, so a proposal can be judged at a glance.
 * - Review: everything open, so prepared translations and examples are inspectable before Apply.
 * - Sheet (author + learner): only term, play and transcription by default; each row toggles open
 *   to reveal translation, definition and example.
 */
export function VocabularyView({ block, variant, scope, limit = 6, expandAll }: VocabularyViewProps) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const listRef = useRef<HTMLUListElement>(null);
  const [wide, setWide] = useState(false);
  const compact = variant === 'compact';
  const collapsible = variant === 'author' || variant === 'learner';
  const rows = compact ? block.entries.slice(0, limit) : block.entries;
  const more = block.entries.length - rows.length;
  const twoCols = !compact && wide && rows.length >= TWO_COLUMN_MIN_ENTRIES;

  useEffect(() => {
    if (!expandAll) return;
    setOpen(expandAll.open ? Object.fromEntries(block.entries.map((e) => [e.id, true])) : {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expandAll?.at]);

  // Columns depend on the block's own width (split/chat layouts narrow it), not the viewport.
  useEffect(() => {
    const el = listRef.current?.parentElement;
    if (!el || compact) return;
    const ro = new ResizeObserver(([entry]) => setWide(entry.contentRect.width >= TWO_COLUMN_MIN_WIDTH));
    ro.observe(el);
    return () => ro.disconnect();
  }, [compact]);

  if (!block.entries.length) return <p className="py-2 text-sm text-text-tertiary">{ru.vocab.empty}</p>;

  return (
    <div>
      <ul ref={listRef} className={twoCols ? 'columns-2 gap-x-8' : ''}>
        {rows.map((e) =>
          compact ? (
            <CompactRow key={e.id} entry={e} scope={scope} />
          ) : (
            <FullRow
              key={e.id}
              entry={e}
              scope={scope}
              collapsible={collapsible}
              expanded={!collapsible || !!open[e.id]}
              onToggle={() => setOpen((o) => ({ ...o, [e.id]: !o[e.id] }))}
            />
          ),
        )}
      </ul>
      {more > 0 && <p className="pt-1 text-xs text-text-tertiary">{ru.proposal.more(more)}</p>}
    </div>
  );
}

function CompactRow({ entry: e, scope }: { entry: VocabularyEntry; scope: string }) {
  return (
    <li className="flex items-center gap-2 border-b border-border-default py-1.5 last:border-b-0">
      <PlayButton id={`${scope}:${e.id}`} text={e.term} label={ru.vocab.play(e.term)} />
      <span lang="fr" className="w-2/5 min-w-0 truncate text-sm font-medium text-text-primary">
        {e.term}
      </span>
      <span className="flex-1" aria-hidden="true" />
      <span lang="ru" className="min-w-0 truncate text-right text-sm text-text-secondary">
        {e.translation}
      </span>
    </li>
  );
}

interface FullRowProps {
  entry: VocabularyEntry;
  scope: string;
  collapsible: boolean;
  expanded: boolean;
  onToggle: () => void;
}

function FullRow({ entry: e, scope, collapsible, expanded, onToggle }: FullRowProps) {
  const detailsId = `${scope}-${e.id}-details`;
  const hasDetails = !!(e.translation || e.definition || e.example);

  return (
    <li className="break-inside-avoid border-b border-border-default py-2 last:border-b-0">
      <div className="flex min-h-9 items-center gap-2">
        <PlayButton id={`${scope}:${e.id}`} text={e.term} label={ru.vocab.play(e.term)} />
        <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2">
          <span lang="fr" className="min-w-0 break-words text-base font-medium text-text-primary">
            {e.term}
          </span>
          {e.ipa && <span className="text-xs text-text-tertiary">{e.ipa}</span>}
          {!collapsible && (
            <span lang="ru" className="ml-auto text-base text-text-secondary">
              {e.translation}
            </span>
          )}
        </div>
        {collapsible && hasDetails && (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={expanded}
            aria-controls={detailsId}
            aria-label={expanded ? ru.vocab.collapseEntry(e.term) : ru.vocab.expandEntry(e.term)}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-text-tertiary hover:bg-background-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
          >
            <ChevronDownIcon className={`h-4 w-4 transition-transform duration-150 ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
        )}
      </div>
      {expanded && hasDetails && (
        <div id={detailsId} className="ml-9 mt-1 space-y-1 pb-1">
          {collapsible && e.translation && (
            <p lang="ru" className="text-base text-text-primary">
              {e.translation}
            </p>
          )}
          {e.definition && <p className="text-sm leading-6 text-text-secondary">{e.definition}</p>}
          {e.example && (
            <div className="flex items-start gap-1.5">
              <div className="min-w-0 flex-1 border-l-2 border-border-strong pl-2.5">
                <p lang="fr" className="text-sm leading-6 text-text-primary">
                  {e.example}
                </p>
                {e.exampleTranslation && (
                  <p lang="ru" className="text-sm leading-6 text-text-tertiary">
                    {e.exampleTranslation}
                  </p>
                )}
              </div>
              <PlayButton id={`${scope}:${e.id}:ex`} text={e.example} label={ru.vocab.playExample} />
            </div>
          )}
        </div>
      )}
    </li>
  );
}

