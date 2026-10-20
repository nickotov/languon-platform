import React, { useEffect, useState } from 'react';
import { AlertTriangleIcon, CrosshairIcon, FileInputIcon, ListEndIcon, ReplaceIcon, XIcon } from 'lucide-react';
import type { DocChatMessage } from '../../types/document';
import type { RichEditor } from '../../utils/richEditor';
import { Button } from '../Button';
import { htmlToText } from '../../utils/docCompare';

type Mode = 'insert' | 'append' | 'replace';

interface ProposalReviewProps {
  editor: RichEditor;
  message: DocChatMessage;
  touch: boolean;
  onClose: () => void;
  onApplied: (summary: string) => void;
}

const clip = (s: string, n: number, fromEnd = false) => (s.length <= n ? s : fromEnd ? `…${s.slice(s.length - n)}` : `${s.slice(0, n)}…`);

export function ProposalReview({ editor, message, touch, onClose, onApplied }: ProposalReviewProps) {
  const suggestion = message.suggestion!;
  const targetId = message.targetId ?? '';
  const target = editor.getTarget(targetId);
  const hasSelection = Boolean(target && target.original);
  const current = target ? target.range.toString() : '';
  const changed = hasSelection && current !== target!.original;
  const [mode, setMode] = useState<Mode>(hasSelection ? 'replace' : 'insert');
  const [compared, setCompared] = useState(false);

  useEffect(() => {
    editor.setActiveTarget(targetId);
    return () => editor.setActiveTarget(null);
  }, [editor, targetId]);

  const ctx = target ? editor.blockContext(target.range) : null;
  const atEnd = ctx?.atEnd ?? true;
  const lastBlock = editor.lastBlockText();
  const blockText = htmlToText(suggestion.blockHtml);

  const apply = () => {
    if (mode === 'append') editor.append(suggestion.blockHtml);
    else if (!target) return;
    else if (mode === 'insert') {
      // Mid-paragraph cursor: insert inline. End of a block: insert as new paragraph(s).
      if (!atEnd) editor.insertInline(target.range, ` ${suggestion.inlineHtml} `);
      else editor.insertAfterBlock(target.range, suggestion.blockHtml);
    } else editor.replaceRange(target.range, suggestion.inlineHtml);
    editor.removeTarget(targetId);
    onApplied(mode === 'append' ? 'Appended to the end' : mode === 'insert' ? 'Inserted at your cursor' : 'Replaced your selection');
  };

  const options: { id: Mode; label: string; detail: string; icon: React.ReactNode; disabled?: boolean }[] = [
    {
      id: 'insert',
      label: 'Insert at cursor',
      detail: ctx?.before ? `Where your cursor was: after “${clip(ctx.before, 28, true)}”` : 'Where your cursor was when you asked',
      icon: <FileInputIcon className="h-4 w-4" aria-hidden="true" />,
      disabled: !target,
    },
    { id: 'append', label: 'Append to end', detail: 'After the last paragraph', icon: <ListEndIcon className="h-4 w-4" aria-hidden="true" /> },
    {
      id: 'replace',
      label: 'Replace selection',
      detail: hasSelection ? `The ${target!.original.length} characters you selected` : 'You didn’t select a passage for this question',
      icon: <ReplaceIcon className="h-4 w-4" aria-hidden="true" />,
      disabled: !hasSelection,
    },
  ];

  const replaceBlocked = mode === 'replace' && changed && !compared;
  const pad = touch ? 'min-h-11' : '';

  return (
    <section aria-label="Review tutor proposal" className="rounded-2xl border border-primary-200 bg-background-surface shadow-lg" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <div className="flex items-start gap-3 border-b border-border-default px-4 py-3">
        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary-default" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-text-primary">Use tutor reply in document</h2>
          <p className="text-xs text-text-secondary">{suggestion.label} · nothing changes until you choose</p>
        </div>
        {target && (
          <button type="button" onClick={() => editor.scrollToRange(target.range)} className={`inline-flex items-center gap-1 rounded-md px-2 text-xs font-medium text-text-secondary hover:bg-background-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${touch ? 'h-11' : 'h-7'}`}>
            <CrosshairIcon className="h-3.5 w-3.5" aria-hidden="true" /> Show target
          </button>
        )}
        <button type="button" onClick={onClose} aria-label="Close review — the reply stays in chat" className={`inline-flex items-center justify-center rounded-md text-text-tertiary hover:bg-background-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${touch ? 'h-11 w-11' : 'h-7 w-7'}`}>
          <XIcon className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div className="px-4 py-3">
        <div role="radiogroup" aria-label="Where to apply" className="grid gap-1.5 sm:grid-cols-3">
          {options.map((o) => {
            const on = mode === o.id;
            return (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={on}
                disabled={o.disabled}
                onClick={() => setMode(o.id)}
                className={`flex items-start gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50 ${pad} ${
                  on ? 'border-primary-default bg-primary-subtle' : 'border-border-default hover:bg-background-subtle'
                }`}
              >
                <span className={`mt-0.5 ${on ? 'text-primary-default' : 'text-text-tertiary'}`}>{o.icon}</span>
                <span className="min-w-0">
                  <span className={`block text-sm font-medium ${on ? 'text-primary-default' : 'text-text-primary'}`}>{o.label}</span>
                  <span className="block text-xs leading-5 text-text-secondary">{o.detail}</span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-3 rounded-xl bg-background-subtle p-3 text-sm leading-6">
          {mode === 'insert' &&
            ctx &&
            (!atEnd ? (
              <p>
                <span className="text-text-secondary">{clip(ctx.before, 70, true)}</span>{' '}
                <ins className="rounded bg-success-subtle px-0.5 text-text-primary no-underline">
                  <span className="sr-only">Added: </span>
                  {suggestion.inlineText}
                </ins>{' '}
                <span className="text-text-secondary">{clip(ctx.after, 50)}</span>
              </p>
            ) : (
              <>
                <p className="text-text-secondary">{clip(ctx.before, 110, true) || 'Start of an empty line'}</p>
                <p className="mt-1.5 rounded-md border-l-2 border-success-default bg-success-subtle px-2.5 py-1.5 text-text-primary">
                  <span className="sr-only">Added paragraph: </span>
                  {blockText}
                </p>
              </>
            ))}
          {mode === 'append' && (
            <>
              <p className="text-xs font-medium text-text-tertiary">Current end of document</p>
              <p className="text-text-secondary">{clip(lastBlock, 110, true)}</p>
              <p className="mt-1.5 rounded-md border-l-2 border-success-default bg-success-subtle px-2.5 py-1.5 text-text-primary">
                <span className="sr-only">Added: </span>
                {blockText}
              </p>
            </>
          )}
          {mode === 'replace' && target && !changed && (
            <div className="space-y-1.5">
              <p>
                <span className="mr-1.5 text-xs font-medium text-text-tertiary">Remove</span>
                <del className="text-text-secondary decoration-danger-default">{target.original}</del>
              </p>
              <p>
                <span className="mr-1.5 text-xs font-medium text-text-tertiary">Add</span>
                <ins className="rounded bg-success-subtle px-0.5 text-text-primary no-underline">{suggestion.inlineText}</ins>
              </p>
            </div>
          )}
          {mode === 'replace' && target && changed && (
            <div>
              <p className="flex items-start gap-2 text-xs font-medium text-warning-default">
                <AlertTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                This passage changed while the tutor was replying. Compare before replacing.
              </p>
              <dl className="mt-2 grid gap-2 md:grid-cols-3">
                {[
                  { k: 'When you asked', v: target.original, cls: 'text-text-secondary' },
                  { k: 'In the document now', v: current || '(passage was deleted)', cls: 'text-text-primary font-medium' },
                  { k: 'Proposed', v: suggestion.inlineText, cls: 'text-text-primary' },
                ].map((c) => (
                  <div key={c.k} className="rounded-lg border border-border-default bg-background-surface p-2.5">
                    <dt className="text-xs font-medium text-text-tertiary">{c.k}</dt>
                    <dd className={`mt-1 ${c.cls}`}>{c.v}</dd>
                  </div>
                ))}
              </dl>
              <label className={`mt-2 flex cursor-pointer items-center gap-2 text-sm text-text-primary ${pad}`}>
                <input type="checkbox" checked={compared} onChange={(e) => setCompared(e.target.checked)} className="h-4 w-4 accent-primary-default" />
                I’ve compared — replace the current text with the proposal
              </label>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border-default px-4 py-3">
        <p className="text-xs text-text-tertiary">Applied as one edit — Undo reverses it.</p>
        <div className="flex gap-2">
          <Button variant="ghost" size={touch ? 'default' : 'compact'} onClick={onClose}>
            Cancel
          </Button>
          <Button size={touch ? 'default' : 'compact'} onClick={apply} disabled={replaceBlocked || (mode !== 'append' && !target)}>
            {mode === 'insert' ? 'Insert' : mode === 'append' ? 'Append' : changed ? 'Replace current text' : 'Replace'}
          </Button>
        </div>
      </div>
    </section>
  );
}

