import React, { useLayoutEffect, useState } from 'react';
import { ArrowUpIcon, ClipboardIcon, FileTextIcon, PlusIcon, SquareIcon, TextQuoteIcon, XIcon } from 'lucide-react';
import type { RichEditor } from '../../../utils/richEditor';
import type { DocChatApi } from '../../../hooks/useDocChat';
import { Tooltip } from '../../Tooltip';
import { ReferencePicker } from './ReferencePicker';
import { ChatPreferencesPopover } from './ChatPreferencesPopover';
import { formatChars } from '../../../utils/docCompare';
import { ru } from '../../../data/strings';

interface DocChatComposerProps {
  chat: DocChatApi;
  editor: RichEditor | null;
  touch: boolean;
  docChars: number;
  composerRef: React.RefObject<HTMLTextAreaElement>;
  onFocusChange?: (focused: boolean) => void;
}

export function DocChatComposer({ chat, editor, touch, docChars, composerRef, onFocusChange }: DocChatComposerProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const selectionOnly = chat.prefs.context === 'selection' && chat.passage !== null;
  const overLimit = docChars > chat.docLimit && !selectionOnly;
  const canSend = !chat.streaming && !overLimit && (chat.text.trim().length > 0 || chat.passage !== null);
  const iconBtn = `inline-flex shrink-0 items-center justify-center rounded-lg text-text-secondary hover:bg-background-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${touch ? 'h-11 w-11' : 'h-8 w-8'}`;
  const chipX = `inline-flex shrink-0 items-center justify-center rounded text-text-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${touch ? 'h-9 w-9' : 'h-5 w-5'}`;

  useLayoutEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [chat.text, composerRef]);

  return (
    <div className="relative shrink-0 px-3 pb-3 pt-2">
      {pickerOpen && (
        <ReferencePicker
          attached={chat.references}
          error={chat.refError}
          touch={touch}
          onAdd={(r) => {
            const ok = chat.addReference(r);
            if (ok) {
              setPickerOpen(false);
              composerRef.current?.focus();
            }
            return ok;
          }}
          onClose={() => {
            setPickerOpen(false);
            chat.setRefError(null);
            composerRef.current?.focus();
          }}
        />
      )}

      {(chat.sendError || overLimit) && (
        <p role="alert" className="mb-2 rounded-lg bg-danger-subtle px-2.5 py-2 text-xs leading-5 text-danger-default">
          {chat.sendError ?? ru.composer.overLimit(ru.common.chars(formatChars(docChars)), ru.common.chars(formatChars(chat.docLimit)))}
        </p>
      )}

      <div className="rounded-2xl border border-border-strong bg-background-surface transition-colors focus-within:border-border-focus focus-within:ring-2 focus-within:ring-primary-100">
        <ul aria-label={ru.composer.attached} className="flex flex-wrap gap-1.5 px-2.5 pt-2.5">
          <li>
            <Tooltip content={ru.chat.contextHint} placement="top">
              <span tabIndex={0} className="inline-flex h-6 items-center gap-1 rounded-md bg-background-subtle px-1.5 text-xs font-medium text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus">
                <FileTextIcon className="h-3.5 w-3.5" aria-hidden="true" />
                {selectionOnly ? ru.composer.documentSelection : ru.composer.document}
              </span>
            </Tooltip>
          </li>
          {chat.passage && (
            <li className="flex min-w-0 max-w-full items-center gap-1 rounded-md bg-primary-subtle py-0.5 pl-1.5 pr-0.5 text-xs">
              <TextQuoteIcon className="h-3.5 w-3.5 shrink-0 text-primary-default" aria-hidden="true" />
              <span className="shrink-0 font-medium text-primary-default">{ru.composer.passage}</span>
              <span className="min-w-0 truncate text-text-primary" title={chat.passage.text}>
                «{chat.passage.text}»
              </span>
              <button type="button" onClick={() => chat.removePassage(editor)} aria-label={ru.composer.removePassage} className={chipX}>
                <XIcon className="h-3 w-3" aria-hidden="true" />
              </button>
            </li>
          )}
          {chat.references.map((r) => (
            <li key={r.id} className="flex min-w-0 max-w-full items-center gap-1 rounded-md border border-dashed border-border-strong py-0.5 pl-1.5 pr-0.5 text-xs">
              <ClipboardIcon className="h-3.5 w-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
              <span className="min-w-0 truncate text-text-primary" title={`${ru.composer.copiedRef}: ${r.excerpt}`}>
                {r.title}
              </span>
              <span className="shrink-0 text-text-tertiary">{ru.common.chars(formatChars(r.text.length))}</span>
              <button type="button" onClick={() => chat.removeReference(r.id)} aria-label={ru.composer.removeRef(r.title)} className={chipX}>
                <XIcon className="h-3 w-3" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        <label htmlFor="doc-chat-input" className="sr-only">
          {ru.composer.label}
        </label>
        <textarea
          id="doc-chat-input"
          ref={composerRef}
          rows={1}
          value={chat.text}
          onChange={(e) => chat.setText(e.target.value)}
          onFocus={() => onFocusChange?.(true)}
          onBlur={() => onFocusChange?.(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (canSend) chat.send(editor);
            } else if (e.key === '/' && chat.text.trim() === '') {
              e.preventDefault();
              setPickerOpen(true);
            } else if (e.key === 'Escape' && pickerOpen) {
              setPickerOpen(false);
            }
          }}
          placeholder={chat.passage ? ru.composer.placeholderPassage : ru.composer.placeholder}
          className="block w-full resize-none bg-transparent px-3 pt-2 text-sm leading-6 text-text-primary placeholder:text-text-tertiary focus:outline-none"
        />
        <div className="flex items-center gap-0.5 px-1.5 pb-1.5">
          <Tooltip content={ru.composer.addContext} placement="top">
            <button type="button" onClick={() => setPickerOpen((o) => !o)} aria-label={ru.composer.addContext} aria-expanded={pickerOpen} aria-keyshortcuts="/" className={iconBtn}>
              <PlusIcon className="h-4 w-4" aria-hidden="true" />
            </button>
          </Tooltip>
          <ChatPreferencesPopover chat={chat} touch={touch} />
          <span className="flex-1" />
          {chat.streaming ? (
            <Tooltip content={ru.composer.stop} placement="top">
              <button
                type="button"
                onClick={chat.stop}
                aria-label={ru.composer.stop}
                className={`inline-flex shrink-0 items-center justify-center rounded-xl border border-border-strong text-text-primary hover:bg-background-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${touch ? 'h-11 w-11' : 'h-8 w-8'}`}
              >
                <SquareIcon className="h-3.5 w-3.5 fill-current" aria-hidden="true" />
              </button>
            </Tooltip>
          ) : (
            <button
              type="button"
              onClick={() => chat.send(editor)}
              disabled={!canSend}
              aria-label={ru.composer.send}
              className={`inline-flex shrink-0 items-center justify-center rounded-xl bg-primary-default text-background-surface hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 disabled:bg-background-subtle disabled:text-text-disabled ${touch ? 'h-11 w-11' : 'h-8 w-8'}`}
            >
              <ArrowUpIcon className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

