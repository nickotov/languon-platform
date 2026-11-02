import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookAIcon, CheckIcon, ClipboardPasteIcon, FileTextIcon, SearchIcon, XIcon } from 'lucide-react';
import type { Attachment } from '../../types/tutor';
import { getPickerItems, getSourceInfo } from '../../data/sources';
import { ATTACHMENT_LIMIT, uid } from '../../utils/tutorReducer';
import { isRtl } from '../../utils/richText';
import { Button } from '../Button';
import { useTutorContext } from '../../contexts/TutorContext';

const PASTE_LIMIT = 1200;

interface ContextPickerProps {
  sourceId: string;
  attached: Attachment[];
  onClose: () => void;
}

export function ContextPicker({ sourceId, attached, onClose }: ContextPickerProps) {
  const { tutor, platform } = useTutorContext();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [paste, setPaste] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const touch = platform === 'mobile';
  const source = getSourceInfo(sourceId, tutor.state.notes);
  const unavailable = tutor.state.flags.inaccessibleSources.includes(sourceId);
  const limitReached = attached.length >= ATTACHMENT_LIMIT;

  useEffect(() => {
    inputRef.current?.focus();
    const t = window.setTimeout(() => setLoading(false), 450);
    return () => window.clearTimeout(t);
  }, []);

  const items = useMemo(() => {
    const all = getPickerItems(sourceId, tutor.state.notes);
    const q = query.trim().toLowerCase();
    return q ? all.filter((i) => `${i.title} ${i.subtitle}`.toLowerCase().includes(q)) : all;
  }, [sourceId, tutor.state.notes, query]);

  const isAttached = (id: string) => attached.some((a) => a.id === id);

  const add = (attachment: Attachment) => {
    if (isAttached(attachment.id) || limitReached) return;
    tutor.addAttachment(attachment);
  };

  const addPaste = () => {
    const text = paste.trim();
    if (!text || limitReached) return;
    const truncated = text.length > PASTE_LIMIT;
    tutor.addAttachment({
      id: uid('paste'),
      kind: 'pasted',
      label: text.slice(0, 32),
      text: truncated ? text.slice(0, PASTE_LIMIT) : text,
      origin: 'Pasted from elsewhere',
      external: true,
      dir: isRtl(text) ? 'rtl' : 'ltr',
      truncated,
      originalLength: text.length,
    });
    setPaste('');
    setPasteOpen(false);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(items.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter' && e.target === inputRef.current && items[active]) {
      e.preventDefault();
      add(items[active].attachment);
    }
  };

  const Icon = source.kind === 'dictionary' ? BookAIcon : FileTextIcon;
  const listId = 'context-picker-list';

  return (
    <div
      role="dialog"
      aria-label="Add context"
      onKeyDown={onKeyDown}
      className="absolute inset-x-3 bottom-full z-20 mb-2 flex max-h-96 flex-col overflow-hidden rounded-2xl border border-border-default bg-background-elevated shadow-lg"
    >
      <div className="flex items-center gap-2 border-b border-border-default px-3">
        <SearchIcon className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
          }}
          placeholder={`Search ${source.kindLabel.toLowerCase()} “${source.title}”`}
          aria-label="Search the current source"
          aria-controls={listId}
          aria-activedescendant={items[active] ? `pick-${items[active].id}` : undefined}
          className={`min-w-0 flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary focus:outline-none ${touch ? 'h-12' : 'h-11'}`}
        />
        <button
          type="button"
          onClick={onClose}
          aria-label="Close context picker"
          className={`flex items-center justify-center rounded-lg text-text-tertiary hover:bg-background-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${touch ? 'h-11 w-11' : 'h-8 w-8'}`}
        >
          <XIcon className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
        <p className="px-2 pb-1 pt-1.5 text-xs font-medium text-text-tertiary">From this {source.kindLabel.toLowerCase()}</p>
        {unavailable ? (
          <p className="px-2 py-3 text-sm text-text-secondary">This source is no longer accessible, so its content can’t be attached. You can still paste text below.</p>
        ) : loading ? (
          <div className="space-y-1.5 p-1" aria-label="Loading source content" role="status">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-11 animate-pulse rounded-lg bg-background-subtle" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <p className="px-2 py-3 text-sm text-text-secondary">
            No matches for “{query}” here. Try another word, or paste text from elsewhere.
          </p>
        ) : (
          <ul id={listId} role="listbox" aria-label="Source content" className="space-y-0.5">
            {items.map((item, i) => {
              const done = isAttached(item.id);
              const disabled = !done && limitReached;
              return (
                <li
                  key={item.id}
                  id={`pick-${item.id}`}
                  role="option"
                  aria-selected={done}
                  aria-disabled={disabled}
                  onClick={() => !disabled && add(item.attachment)}
                  onMouseEnter={() => setActive(i)}
                  className={`flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-2 ${i === active ? 'bg-background-subtle' : ''} ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
                >
                  <Icon className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span lang={source.kind === 'dictionary' ? 'fr' : undefined} className="block text-sm font-medium text-text-primary">
                      {item.title}
                    </span>
                    <span lang="fr" className="block truncate text-xs text-text-secondary">
                      {item.subtitle}
                    </span>
                  </span>
                  {done && <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary-default" aria-label="Attached" />}
                </li>
              );
            })}
          </ul>
        )}
        {limitReached && (
          <p className="px-2 pt-2 text-xs text-text-tertiary">Limit of {ATTACHMENT_LIMIT} attachments reached. Remove one to add another.</p>
        )}
      </div>

      <div className="border-t border-border-default p-2">
        {pasteOpen ? (
          <div>
            <label htmlFor="paste-area" className="px-1 text-xs font-medium text-text-secondary">
              Paste text from another source
            </label>
            <textarea
              id="paste-area"
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              dir="auto"
              rows={3}
              placeholder="Paste a sentence, paragraph, or word list…"
              className="mt-1 w-full resize-none rounded-lg border border-border-default bg-background-surface px-2.5 py-2 text-sm text-text-primary placeholder:text-text-tertiary focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-primary-100"
            />
            {paste.length > PASTE_LIMIT && (
              <p className="mt-1 text-xs text-warning-default">
                This text is long ({paste.length.toLocaleString('en-US')} characters). Only the first 1,200 will be attached.
              </p>
            )}
            <div className="mt-1.5 flex justify-end gap-1.5">
              <Button variant="ghost" size={touch ? 'default' : 'compact'} onClick={() => setPasteOpen(false)}>
                Cancel
              </Button>
              <Button size={touch ? 'default' : 'compact'} onClick={addPaste} disabled={!paste.trim() || limitReached}>
                Attach copy
              </Button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setPasteOpen(true)}
            disabled={limitReached}
            className={`flex w-full items-center gap-2 rounded-lg px-2 text-sm text-text-secondary hover:bg-background-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-50 ${touch ? 'h-11' : 'h-9'}`}
          >
            <ClipboardPasteIcon className="h-4 w-4" aria-hidden="true" />
            Paste from another source…
          </button>
        )}
      </div>
    </div>
  );
}

