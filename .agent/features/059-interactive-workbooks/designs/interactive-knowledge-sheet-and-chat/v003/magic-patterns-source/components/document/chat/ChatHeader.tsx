import React from 'react';
import { FileTextIcon, SquarePenIcon, TextQuoteIcon, XIcon } from 'lucide-react';
import { TutorMark } from '../../tutor/TutorMark';
import { Tooltip } from '../../Tooltip';
import { formatChars } from '../../../utils/docCompare';
import { ru } from '../../../data/strings';

interface ChatHeaderProps {
  mobile: boolean;
  docTitle: string;
  docChars: number;
  docLimit: number;
  selectionOnly: boolean;
  canReset: boolean;
  onNew: () => void;
  onClose?: () => void;
}

/** Tutor header plus a one-line "what the tutor reads" indicator. */
export function ChatHeader({ mobile, docTitle, docChars, docLimit, selectionOnly, canReset, onNew, onClose }: ChatHeaderProps) {
  const iconBtn = `inline-flex shrink-0 items-center justify-center rounded-lg text-text-secondary hover:bg-background-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-40 ${mobile ? 'h-11 w-11' : 'h-8 w-8'}`;
  const chars = ru.common.chars(formatChars(docChars));
  const over = docChars > docLimit && !selectionOnly;
  const title = docTitle.trim();
  const sees = selectionOnly ? ru.chat.seesSelection : over ? ru.chat.overLimit(chars, ru.common.chars(formatChars(docLimit))) : title ? ru.chat.sees(title, chars) : ru.chat.seesUntitled(chars);

  return (
    <header className="shrink-0 border-b border-border-default">
      <div className={`flex items-center gap-2 pl-4 pr-2 ${mobile ? 'h-12' : 'h-12'}`}>
        <TutorMark />
        <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-text-primary">{ru.chat.title}</h2>
        <Tooltip content={ru.chat.newConversation} placement="bottom">
          <button type="button" onClick={onNew} disabled={!canReset} aria-label={ru.chat.newConversation} className={iconBtn}>
            <SquarePenIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        </Tooltip>
        {onClose && (
          <Tooltip content={ru.chat.close} placement="bottom">
            <button type="button" onClick={onClose} aria-label={ru.chat.close} className={iconBtn}>
              <XIcon className="h-4 w-4" aria-hidden="true" />
            </button>
          </Tooltip>
        )}
      </div>
      <Tooltip content={ru.chat.contextHint} placement="bottom">
        <p tabIndex={0} className={`mx-2 mb-2 flex items-center gap-1.5 rounded-md px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${over ? 'bg-danger-subtle text-danger-default' : 'text-text-tertiary'}`}>
          {selectionOnly ? <TextQuoteIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" /> : <FileTextIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
          <span className="truncate">{sees}</span>
        </p>
      </Tooltip>
    </header>
  );
}

