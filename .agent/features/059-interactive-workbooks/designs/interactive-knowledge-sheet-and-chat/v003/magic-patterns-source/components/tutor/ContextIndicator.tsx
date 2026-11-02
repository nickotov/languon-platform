import React from 'react';
import { AlertTriangleIcon, BookAIcon, ChevronDownIcon, FileTextIcon, StickyNoteIcon } from 'lucide-react';
import type { Conversation, SourceInfo } from '../../types/tutor';
import { Popover, PopoverContent, PopoverHeader, PopoverTrigger } from '../Popover';
import { useTutorContext } from '../../contexts/TutorContext';

const kindIcon = { text: FileTextIcon, dictionary: BookAIcon, note: StickyNoteIcon };

export function ContextIndicator({ conversation, source, pageSourceId }: { conversation: Conversation; source: SourceInfo; pageSourceId: string }) {
  const { tutor, ui, platform } = useTutorContext();
  const Icon = kindIcon[source.kind];
  const inaccessible = tutor.state.flags.inaccessibleSources.includes(source.id);
  const draftAvailable = ui.hasUnsavedEdits && source.id === pageSourceId && source.kind === 'text';
  const usingDraft = draftAvailable && conversation.composer.useDraftSource;
  const otherPage = source.id !== pageSourceId;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Source: ${source.title}${usingDraft ? ', using current draft' : ''}. What the tutor can see`}
          className={`-ml-1 inline-flex max-w-full items-center gap-1 rounded-md px-1 text-xs text-text-secondary hover:bg-background-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${platform === 'mobile' ? 'h-8' : 'h-6'}`}
        >
          {inaccessible ? (
            <AlertTriangleIcon className="h-3 w-3 shrink-0 text-warning-default" aria-hidden="true" />
          ) : (
            <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
          )}
          <span lang="fr" className="truncate">
            {source.title}
          </span>
          {usingDraft && <span className="shrink-0 rounded bg-warning-subtle px-1 text-warning-default">Draft</span>}
          {otherPage && <span className="shrink-0 text-text-tertiary">· other page</span>}
          <ChevronDownIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" collisionPadding={12} className="w-72 p-3">
        <PopoverHeader>What the tutor can see</PopoverHeader>
        <p className="mt-1 text-sm font-medium text-text-primary">
          {source.kindLabel} · <span lang="fr">{source.title}</span>
        </p>
        <p className="mt-1 text-xs leading-5 text-text-secondary">
          {inaccessible ? 'This source is no longer accessible. New questions won’t include its content.' : source.access}
        </p>
        {otherPage && (
          <p className="mt-2 text-xs leading-5 text-text-secondary">This conversation belongs to this source, not to the page you’re viewing.</p>
        )}
        {draftAvailable && (
          <fieldset className="mt-3 border-t border-border-default pt-3">
            <legend className="text-xs font-medium text-text-primary">This text has unsaved edits</legend>
            {[
              { value: false, label: 'Saved version', hint: 'Default' },
              { value: true, label: 'Use current draft', hint: 'Includes your unsaved edits' },
            ].map((o) => (
              <label key={o.label} className="mt-1.5 flex cursor-pointer items-start gap-2 text-sm text-text-primary">
                <input
                  type="radio"
                  name={`draft-source-${conversation.id}`}
                  checked={conversation.composer.useDraftSource === o.value}
                  onChange={() => tutor.setComposer({ useDraftSource: o.value })}
                  className="mt-1 accent-primary-default"
                />
                <span>
                  {o.label}
                  <span className="block text-xs text-text-tertiary">{o.hint}</span>
                </span>
              </label>
            ))}
          </fieldset>
        )}
      </PopoverContent>
    </Popover>
  );
}

