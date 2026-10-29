import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckIcon, CopyIcon, MessageSquarePlusIcon, PaperclipIcon } from 'lucide-react';
import type { Attachment } from '../../types/tutor';
import { uid } from '../../utils/tutorReducer';
import { isRtl } from '../../utils/richText';

interface SelectionInfo {
  text: string;
  top: number;
  bottom: number;
  center: number;
  paragraph?: string;
}

interface SelectionToolbarProps {
  mode: 'ask' | 'attach';
  sourceTitle: string;
  touch: boolean;
  onAttach: (attachment: Attachment) => void;
}

const LIMIT = 1200;

export function SelectionToolbar({ mode, sourceTitle, touch, onAttach }: SelectionToolbarProps) {
  const [sel, setSel] = useState<SelectionInfo | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let timer = 0;
    const read = () => {
      const s = window.getSelection();
      if (!s || s.isCollapsed || s.rangeCount === 0) return setSel(null);
      const range = s.getRangeAt(0);
      const node = range.commonAncestorContainer;
      const el = (node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement) as Element | null;
      if (!el?.closest('[data-source-selectable]')) return setSel(null);
      const text = s.toString().trim();
      if (text.length < 2) return setSel(null);
      const rect = range.getBoundingClientRect();
      const para = (range.startContainer.parentElement as Element | null)?.closest('[data-passage-index]');
      setSel({
        text,
        top: rect.top,
        bottom: rect.bottom,
        center: rect.left + rect.width / 2,
        paragraph: para?.getAttribute('data-passage-index') ?? undefined,
      });
      setCopied(false);
    };
    const schedule = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(read, 140);
    };
    document.addEventListener('selectionchange', schedule);
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('selectionchange', schedule);
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
    };
  }, []);

  if (!sel) return null;

  const width = mode === 'attach' ? 252 : 196;
  const left = Math.max(8, Math.min(window.innerWidth - width - 8, sel.center - width / 2));
  const above = sel.top - (touch ? 56 : 48);
  const top = touch || above < 8 ? sel.bottom + 10 : above;

  const attach = () => {
    const truncated = sel.text.length > LIMIT;
    const text = truncated ? sel.text.slice(0, LIMIT) : sel.text;
    onAttach({
      id: uid('quote'),
      kind: 'quote',
      label: `“${text.slice(0, 26)}${text.length > 26 ? '…' : ''}”`,
      text,
      origin: sel.paragraph ? `${sourceTitle} · paragraph ${sel.paragraph}` : sourceTitle,
      external: false,
      dir: isRtl(text) ? 'rtl' : 'ltr',
      truncated,
      originalLength: sel.text.length,
    });
    setSel(null);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(sel.text);
      setCopied(true);
    } catch {
      document.execCommand('copy');
      setCopied(true);
    }
  };

  const btn = `inline-flex items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${touch ? 'h-11' : 'h-9'}`;

  return createPortal(
    <div
      role="toolbar"
      aria-label="Selected text actions"
      onMouseDown={(e) => e.preventDefault()}
      style={{ position: 'fixed', top, left, width }}
      className="z-50 flex items-center gap-1 rounded-xl border border-border-default bg-background-elevated p-1 shadow-lg"
    >
      <button type="button" onClick={attach} className={`${btn} flex-1 justify-center bg-primary-default text-background-surface hover:bg-primary-hover`}>
        {mode === 'attach' ? <PaperclipIcon className="h-4 w-4" aria-hidden="true" /> : <MessageSquarePlusIcon className="h-4 w-4" aria-hidden="true" />}
        {mode === 'attach' ? 'Attach to question' : 'Ask tutor'}
      </button>
      <button type="button" onClick={copy} className={`${btn} text-text-secondary hover:bg-background-subtle hover:text-text-primary`}>
        {copied ? <CheckIcon className="h-4 w-4" aria-hidden="true" /> : <CopyIcon className="h-4 w-4" aria-hidden="true" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>,
    document.body,
  );
}

