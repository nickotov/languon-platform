import React from 'react';
import { Columns2Icon, FileTextIcon, MessagesSquareIcon } from 'lucide-react';
import type { LayoutMode } from '../../types/document';
import { Tooltip } from '../Tooltip';
import { ru } from '../../data/strings';

interface LayoutSwitchProps {
  mode: LayoutMode;
  allowChat: boolean;
  onChange: (mode: LayoutMode) => void;
}

const options: { id: LayoutMode; label: string; hint: string; icon: typeof FileTextIcon }[] = [
  { id: 'focus', label: ru.topBar.layoutFocus, hint: ru.topBar.layoutFocusHint, icon: FileTextIcon },
  { id: 'split', label: ru.topBar.layoutSplit, hint: ru.topBar.layoutSplitHint, icon: Columns2Icon },
  { id: 'chat', label: ru.topBar.layoutChat, hint: ru.topBar.layoutChatHint, icon: MessagesSquareIcon },
];

/** Focus / Split / Chat workspace layouts. */
export function LayoutSwitch({ mode, allowChat, onChange }: LayoutSwitchProps) {
  const enabled = options.filter((o) => o.id !== 'chat' || allowChat);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    const i = Math.max(0, enabled.findIndex((o) => o.id === mode));
    const next = enabled[(i + (e.key === 'ArrowRight' ? 1 : -1) + enabled.length) % enabled.length];
    onChange(next.id);
    window.requestAnimationFrame(() => document.getElementById(`layout-${next.id}`)?.focus());
  };

  return (
    <div role="radiogroup" aria-label={ru.topBar.layout} onKeyDown={onKeyDown} className="inline-flex shrink-0 items-center gap-0.5 rounded-lg bg-background-subtle p-0.5">
      {options.map((o) => {
        const on = mode === o.id;
        const disabled = o.id === 'chat' && !allowChat;
        return (
          <Tooltip key={o.id} content={`${o.label} — ${o.hint}`} placement="bottom">
            <button
              id={`layout-${o.id}`}
              type="button"
              role="radio"
              aria-checked={on}
              aria-label={o.label}
              disabled={disabled}
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(o.id)}
              className={`inline-flex h-7 w-8 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-40 ${
                on ? 'bg-background-surface text-text-primary shadow-sm' : 'text-text-tertiary hover:text-text-primary'
              }`}
            >
              <o.icon className="h-4 w-4" aria-hidden="true" />
            </button>
          </Tooltip>
        );
      })}
    </div>
  );
}

