import React, { useLayoutEffect, useState } from 'react';
import type { RichEditor as Editor } from '../../../utils/richEditor';
import { ArrowUpIcon, ClipboardIcon, PlusIcon, TextQuoteIcon, XIcon } from 'lucide-react';
import type { DocChatApi } from '../../../hooks/useDocChat';
import { ReferencePicker } from './ReferencePicker';
import { formatChars } from '../../../utils/docCompare';

interface DocChatComposerProps {
  chat: DocChatApi;
  editor: Editor | null;
  touch: boolean;
  docChars: number;
  composerRef: React.RefObject<HTMLTextAreaElement>;
  onFocusChange?: (focused: boolean) => void;
}

export function DocChatComposer({ chat, editor, touch, docChars, composerRef, onFocusChange }: DocChatComposerProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const overLimit = docChars > chat.docLimit;

  useLayoutEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  }, [chat.text, composerRef]);

  const send = () => chat.send(editor);
  const canSend = !chat.streaming && (chat.text.trim().length > 0 || chat.passage !== null);

  return (
    <div className="relative border-t border-border-default bg-background-surface p-3">
      {pickerOpen && (
        <ReferencePicker
          attached={chat.references}
          error={chat.refError}
          touch={touch}
          onAdd={(r) => {
            const ok = chat.addReference(r);
            if (ok) setPickerOpen(false);
            return ok;
          }}
          onClose={() => {
            setPickerOpen(false);
            chat.setRefError(null);
            composerRef.current?.focus();
          }}
        />
      )}

      {(chat.passage || chat.references.length > 0) && (
        <ul className="mb-2 space-y-1.5" aria-label="Attached to your next message">
          {chat.passage && (
            <li className="flex items-start gap-2 rounded-xl border border-primary-200 bg-primary-subtle py-2 pl-2.5 pr-1">
              <TextQuoteIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary-default" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium text-primary-default">Selected passage · {chat.passage.blockLabel}</p>
                <p lang="es" className="line-clamp-2 text-xs leading-5 text-text-primary">
                  {chat.passage.text}
                </p>
              </div>
              <button type="button" onClick={() => chat.removePassage(editor)} aria-label="Remove selected passage" className={`inline-flex shrink-0 items-center justify-center rounded-md text-text-tertiary hover:bg-background-surface hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${touch ? 'h-11 w-11' : 'h-7 w-7'}`}>
                <XIcon className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          )}
          {chat.references.map((r) => (
            <li key={r.id} className="flex items-start gap-2 rounded-xl border border-dashed border-border-strong bg-background-surface py-2 pl-2.5 pr-1">
              <ClipboardIcon className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-medium text-text-primary">
                  {r.title} <span className="font-normal text-text-tertiary">· copied reference · {formatChars(r.text.length)} ch</span>
                </p>
                <p className="truncate text-xs text-text-secondary">{r.excerpt}</p>
              </div>
              <button type="button" onClick={() => chat.removeReference(r.id)} aria-label={`Remove reference ${r.title}`} className={`inline-flex shrink-0 items-center justify-center rounded-md text-text-tertiary hover:bg-background-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${touch ? 'h-11 w-11' : 'h-7 w-7'}`}>
                <XIcon className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {(chat.sendError || overLimit) && (
        <p role="alert" className="mb-2 rounded-lg bg-danger-subtle px-2.5 py-2 text-xs leading-5 text-danger-default">
          {chat.sendError ??
            `Your document is ${formatChars(docChars)} characters — the tutor can read up to ${formatChars(chat.docLimit)}. Shorten it to send.`}
        </p>
      )}

      <div className="rounded-2xl border border-border-default focus-within:border-border-focus focus-within:ring-2 focus-within:ring-primary-100">
        <label htmlFor="doc-chat-input" className="sr-only">
          Message the tutor
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
              if (canSend) send();
            } else if (e.key === '/' && chat.text.trim() === '') {
              e.preventDefault();
              setPickerOpen(true);
            }
          }}
          placeholder={chat.passage ? 'Ask about the selected passage…' : 'Ask about your document…'}
          className="block w-full resize-none bg-transparent px-3 pt-2.5 text-sm leading-6 text-text-primary placeholder:text-text-tertiary focus:outline-none"
        />
        <div className="flex items-center justify-between gap-2 px-1.5 pb-1.5">
          <button
            type="button"
            onClick={() => setPickerOpen((o) => !o)}
            aria-expanded={pickerOpen}
            aria-keyshortcuts="/"
            className={`inline-flex items-center gap-1.5 rounded-lg px-2 text-xs font-medium text-text-secondary hover:bg-background-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${touch ? 'h-11' : 'h-8'}`}
          >
            <PlusIcon className="h-4 w-4" aria-hidden="true" />
            Add context
            {!touch && <kbd className="rounded border border-border-default px-1 font-sans text-text-tertiary">/</kbd>}
          </button>
          <span className={`hidden truncate text-xs sm:inline ${overLimit ? 'text-danger-default' : 'text-text-tertiary'}`}>
            Document {formatChars(docChars)} / {formatChars(chat.docLimit)}
          </span>
          <button
            type="button"
            onClick={send}
            disabled={!canSend || overLimit}
            aria-label={chat.streaming ? 'Wait for the tutor to finish' : 'Send to tutor'}
            className={`inline-flex shrink-0 items-center justify-center rounded-xl bg-primary-default text-background-surface hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 disabled:bg-background-subtle disabled:text-text-disabled ${touch ? 'h-11 w-11' : 'h-8 w-8'}`}
          >
            <ArrowUpIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      <p className="mt-1.5 px-1 text-xs text-text-tertiary">The tutor reads your full current document, including unsaved edits, when you send.</p>
    </div>
  );
}

