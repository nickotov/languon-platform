import React from 'react';
import { MessageSquarePlusIcon } from 'lucide-react';
import { nuancesDictionary } from '../data/sources';
import type { DictionaryCard } from '../types/tutor';
import { Badge } from '../components/Badge';

interface DictionaryPageProps {
  onAskCard: (card: DictionaryCard) => void;
  attachedIds: string[];
  compact: boolean;
}

export function DictionaryPage({ onAskCard, attachedIds, compact }: DictionaryPageProps) {
  return (
    <div className={`mx-auto w-full max-w-4xl ${compact ? 'px-4 pb-32 pt-5' : 'px-8 pb-24 pt-10'}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">Dictionary · {nuancesDictionary.cards.length} cards</p>
      <h1 lang="fr" className={`mt-2 font-semibold tracking-tight text-text-primary ${compact ? 'text-2xl' : 'text-3xl'}`}>
        {nuancesDictionary.title}
      </h1>
      <p className="mt-2 max-w-2xl text-base leading-7 text-text-secondary">{nuancesDictionary.description}</p>

      <ul data-source-selectable className={`mt-6 grid gap-3 ${compact ? 'grid-cols-1' : 'grid-cols-2'}`}>
        {nuancesDictionary.cards.map((card) => {
          const attached = attachedIds.includes(`card:${card.id}`);
          return (
            <li key={card.id} className="flex flex-col rounded-2xl border border-border-default bg-background-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p lang="fr" className="text-lg font-semibold text-text-primary">
                    {card.word}
                  </p>
                  <p className="text-xs text-text-tertiary">
                    {card.transcription} · {card.partOfSpeech}
                  </p>
                </div>
                <Badge size="sm" tone={card.register === 'Formal' ? 'info' : 'neutral'}>
                  {card.register}
                </Badge>
              </div>
              <p className="mt-2 text-sm font-medium text-text-primary">{card.translation}</p>
              <p className="mt-1 text-sm leading-6 text-text-secondary">{card.definition}</p>
              <div className="mt-2 space-y-1.5">
                {card.examples.slice(0, 1).map((ex) => (
                  <div key={ex.source} className="border-l-2 border-primary-200 pl-2.5">
                    <p lang="fr" className="text-sm text-text-primary">{ex.source}</p>
                    <p className="text-xs text-text-secondary">{ex.translation}</p>
                  </div>
                ))}
              </div>
              <div className="mt-auto pt-3">
                <button
                  type="button"
                  onClick={() => onAskCard(card)}
                  disabled={attached}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-text-secondary hover:bg-background-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-default disabled:text-primary-default disabled:hover:bg-transparent ${compact ? 'h-11' : 'h-8'}`}
                >
                  <MessageSquarePlusIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  {attached ? 'Attached to question' : 'Ask tutor'}
                  <span className="sr-only"> about {card.word}</span>
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

