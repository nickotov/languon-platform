import React, { useEffect, useRef, useState } from 'react';
import { BoldIcon, ChevronLeftIcon, EllipsisIcon, ItalicIcon, SparklesIcon } from 'lucide-react';
import type { SelectionAction } from '../../types/document';
import type { RichEditor } from '../../utils/richEditor';
import { ru } from '../../data/strings';

interface DocEditorProps {
  editor: RichEditor;
  touch: boolean;
  proseClass: string;
  /** Show Explain / Correct / Translate / … in addition to Ask. */
  aiActions: boolean;
  /** A reply is in progress, so one-shot AI actions are paused. */
  busy: boolean;
  onAction: (action: SelectionAction) => void;
  /** Positioned overlays (inline edit review) that share the editor's coordinate space. */
  overlay?: React.ReactNode;
}

const primary: SelectionAction[] = ['explain', 'correct', 'translate'];
const secondary: SelectionAction[] = ['simplify', 'rephrase', 'examples'];

export function DocEditor({ editor, touch, proseClass, aiActions, busy, onAction, overlay }: DocEditorProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState(false);

  const rect = editor.selectionRect();
  const wrap = wrapRef.current?.getBoundingClientRect();
  const show = !!rect && !!wrap && (editor.selectionInfo()?.text.trim().length ?? 0) > 1 && !editor.isActive('table');

  useEffect(() => {
    if (!show) setMore(false);
  }, [show]);

  let style: React.CSSProperties | undefined;
  if (show && rect && wrap) {
    const w = bubbleRef.current?.offsetWidth ?? 0;
    const center = rect.left - wrap.left + rect.width / 2;
    const left = Math.max(-16, Math.min(center - w / 2, wrap.width - w + 16));
    const below = touch || rect.top - wrap.top < 56;
    style = below ? { left, top: rect.bottom - wrap.top + 10 } : { left, top: rect.top - wrap.top - 10, transform: 'translateY(-100%)' };
  }

  const keep = (e: React.MouseEvent) => e.preventDefault();
  const h = touch ? 'h-11' : 'h-8';
  const text = `inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-40 ${h}`;
  const icon = `inline-flex shrink-0 items-center justify-center rounded-lg text-text-secondary hover:bg-background-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${touch ? 'h-11 w-11' : 'h-8 w-8'}`;
  const actionBtn = (a: SelectionAction) => (
    <button
      key={a}
      type="button"
      onMouseDown={keep}
      onClick={() => onAction(a)}
      disabled={busy}
      title={busy ? ru.selection.busy : undefined}
      className={`${text} text-text-primary hover:bg-background-subtle`}
    >
      {ru.selection[a]}
    </button>
  );

  return (
    <div ref={wrapRef} className="relative">
      <div
        ref={editor.mount}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label={ru.canvas.bodyLabel}
        spellCheck
        data-placeholder={ru.canvas.bodyPlaceholder}
        onInput={editor.handleInput}
        onKeyDown={(e) => editor.handleShortcut(e)}
        className={`${proseClass} focus:outline-none`}
      />

      {show && (
        <div
          ref={bubbleRef}
          role="toolbar"
          aria-label={ru.selection.label}
          style={style}
          onKeyDown={(e) => {
            if (e.key === 'Escape') editor.focus();
          }}
          className="absolute z-30 flex items-center gap-0.5 whitespace-nowrap rounded-xl border border-border-default bg-background-elevated p-1 shadow-lg"
        >
          <button
            type="button"
            onMouseDown={keep}
            onClick={() => onAction('ask')}
            title={ru.selection.askHint}
            className={`${text} bg-primary-subtle text-primary-default hover:bg-primary-100`}
          >
            <SparklesIcon className="h-4 w-4" aria-hidden="true" />
            {ru.selection.ask}
          </button>
          {aiActions && (
            <>
              {(more ? secondary : primary).map(actionBtn)}
              <button
                type="button"
                onMouseDown={keep}
                onClick={() => setMore((m) => !m)}
                aria-label={more ? ru.selection.less : ru.selection.more}
                aria-expanded={more}
                className={icon}
              >
                {more ? <ChevronLeftIcon className="h-4 w-4" aria-hidden="true" /> : <EllipsisIcon className="h-4 w-4" aria-hidden="true" />}
              </button>
            </>
          )}
          <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-border-default" />
          <button type="button" aria-label={ru.selection.bold} aria-pressed={editor.isActive('bold')} onMouseDown={keep} onClick={() => editor.toggleMark('bold')} className={`${icon} ${editor.isActive('bold') ? '!text-primary-default' : ''}`}>
            <BoldIcon className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" aria-label={ru.selection.italic} aria-pressed={editor.isActive('italic')} onMouseDown={keep} onClick={() => editor.toggleMark('italic')} className={`${icon} ${editor.isActive('italic') ? '!text-primary-default' : ''}`}>
            <ItalicIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
      {overlay}
    </div>
  );
}

