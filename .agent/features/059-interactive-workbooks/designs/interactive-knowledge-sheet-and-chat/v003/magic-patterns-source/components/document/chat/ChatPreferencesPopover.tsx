import React from 'react';
import { CheckIcon, SlidersHorizontalIcon } from 'lucide-react';
import type { ChatPrefs } from '../../../types/document';
import type { DocChatApi } from '../../../hooks/useDocChat';
import { Popover, PopoverContent, PopoverTrigger } from '../../Popover';
import { Tooltip } from '../../Tooltip';
import { ru } from '../../../data/strings';

interface ChatPreferencesPopoverProps {
  chat: DocChatApi;
  touch: boolean;
}

type Group = { [K in keyof ChatPrefs]: { key: K; label: string; options: Record<ChatPrefs[K], string> } }[keyof ChatPrefs];

const groups: Group[] = [
  { key: 'mode', label: ru.prefs.mode, options: ru.prefs.modes },
  { key: 'tone', label: ru.prefs.tone, options: ru.prefs.tones },
  { key: 'level', label: ru.prefs.level, options: ru.prefs.levels },
  { key: 'context', label: ru.prefs.context, options: ru.prefs.contexts },
  { key: 'model', label: ru.prefs.model, options: ru.prefs.models },
];

/** Secondary response settings behind one control (progressive disclosure). */
export function ChatPreferencesPopover({ chat, touch }: ChatPreferencesPopoverProps) {
  return (
    <Popover>
      <Tooltip content={ru.composer.settings} placement="top">
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={chat.prefsChanged ? `${ru.composer.settings} · ${ru.prefs.changed}` : ru.composer.settings}
            className={`relative inline-flex shrink-0 items-center justify-center rounded-lg text-text-secondary hover:bg-background-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${touch ? 'h-11 w-11' : 'h-8 w-8'}`}
          >
            <SlidersHorizontalIcon className="h-4 w-4" aria-hidden="true" />
            {chat.prefsChanged && <span aria-hidden="true" className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-primary-default" />}
          </button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent align="start" collisionPadding={12} className="w-80 p-0">
        <div className="border-b border-border-default px-3.5 py-2.5">
          <p className="text-sm font-semibold text-text-primary">{ru.prefs.title}</p>
          <p className="text-xs text-text-tertiary">
            {ru.prefs.scope} · {ru.prefs.models[chat.prefs.model]}
          </p>
        </div>
        <div className="max-h-96 space-y-3 overflow-y-auto px-3.5 py-3">
          {groups.map((g) => (
            <div key={g.key}>
              <p id={`pref-${g.key}`} className="mb-1 text-xs font-medium text-text-secondary">
                {g.label}
              </p>
              <div role="radiogroup" aria-labelledby={`pref-${g.key}`} className="flex flex-wrap gap-1">
                {(Object.entries(g.options) as [string, string][]).map(([value, label]) => {
                  const on = chat.prefs[g.key] === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => chat.setPrefs({ [g.key]: value } as Partial<ChatPrefs>)}
                      className={`rounded-md border px-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${touch ? 'h-11' : 'h-7'} ${
                        on ? 'border-primary-default bg-primary-subtle text-primary-default' : 'border-border-default text-text-secondary hover:bg-background-subtle'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="border-t border-border-default px-3.5 py-2.5">
          {chat.defaultsSaved ? (
            <p role="status" className="flex items-center gap-1.5 text-xs font-medium text-success-default">
              <CheckIcon className="h-3.5 w-3.5" aria-hidden="true" />
              {ru.prefs.defaultsSaved}
            </p>
          ) : (
            <button
              type="button"
              onClick={chat.saveDefaults}
              disabled={!chat.prefsChanged}
              className={`rounded-md px-1.5 text-xs font-medium text-primary-default hover:bg-primary-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:text-text-disabled disabled:hover:bg-transparent ${touch ? 'h-11' : 'h-7'}`}
            >
              {ru.prefs.useDefaults}
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

