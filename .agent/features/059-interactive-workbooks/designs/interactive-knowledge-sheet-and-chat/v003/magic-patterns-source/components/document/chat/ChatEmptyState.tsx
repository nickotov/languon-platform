import React from 'react';
import { ArrowUpLeftIcon } from 'lucide-react';
import { ru } from '../../../data/strings';

interface ChatEmptyStateProps {
  newDoc: boolean;
  touch: boolean;
  onPrompt: (text: string) => void;
}

/** Document-specific first actions. Prompts only fill the composer for review. */
export function ChatEmptyState({ newDoc, touch, onPrompt }: ChatEmptyStateProps) {
  const prompts = newDoc ? ru.chat.promptsNew : ru.chat.prompts;
  return (
    <div className="px-1 pt-2">
      <p className="text-base font-semibold text-text-primary">{newDoc ? ru.chat.emptyNewTitle : ru.chat.emptyTitle}</p>
      <p className="mt-1 text-sm leading-6 text-text-secondary">{newDoc ? ru.chat.emptyNewBody : ru.chat.emptyBody}</p>
      <ul className="mt-4 space-y-1">
        {prompts.map((p) => (
          <li key={p}>
            <button
              type="button"
              onClick={() => onPrompt(p)}
              className={`group flex w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm text-text-primary hover:bg-background-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${touch ? 'min-h-11 py-2' : 'py-2'}`}
            >
              <span className="min-w-0 flex-1">{p}</span>
              <ArrowUpLeftIcon className="h-4 w-4 shrink-0 rotate-180 text-text-tertiary opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

