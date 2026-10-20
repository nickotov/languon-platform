import React, { useRef } from 'react';
import { BoldIcon, CloudCheckIcon, Heading2Icon, ItalicIcon, ListChecksIcon, MessageSquarePlusIcon } from 'lucide-react';
import type { RichEditor } from '../../utils/richEditor';

interface DocEditorProps {
  editor: RichEditor;
  touch: boolean;
  onAskTutor: () => void;
  onAskOutline: () => void;
}

const PLACEHOLDER = 'Start writing. Use the toolbar for headings, lists, quotes and tables.';

export function DocEditor({ editor, touch, onAskTutor, onAskOutline }: DocEditorProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const empty = editor.isEmpty;
  const small = 'inline-flex items-center justify-center rounded-md text-text-secondary hover:bg-background-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus';

  // Contextual selection toolbar position (relative to the wrapper).
  const rect = editor.selectionRect();
  const wrap = wrapRef.current?.getBoundingClientRect();
  const showBubble = !!rect && !!wrap && (editor.selectionInfo()?.text.trim().length ?? 0) > 1 && !editor.isActive('table');
  const bubbleStyle: React.CSSProperties | undefined =
    showBubble && rect && wrap
      ? {
          left: Math.max(0, Math.min(rect.left - wrap.left + rect.width / 2, wrap.width)),
          top: touch ? rect.bottom - wrap.top + 10 : rect.top - wrap.top - 10,
          transform: touch ? 'translateX(-50%)' : 'translate(-50%, -100%)',
        }
      : undefined;

  const keep = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div ref={wrapRef} className="relative">
      {showBubble && (
        <div role="toolbar" aria-label="Selection actions" style={bubbleStyle} className="absolute z-30 flex items-center gap-0.5 whitespace-nowrap rounded-xl border border-border-default bg-background-elevated p-1 shadow-lg">
          <button
            type="button"
            onMouseDown={keep}
            onClick={onAskTutor}
            className={`inline-flex items-center gap-1.5 rounded-lg bg-primary-default px-2.5 text-sm font-medium text-background-surface hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-1 ${touch ? 'h-11' : 'h-8'}`}
          >
            <MessageSquarePlusIcon className="h-4 w-4" aria-hidden="true" />
            Ask tutor
          </button>
          <span aria-hidden="true" className="mx-0.5 h-5 w-px bg-border-default" />
          <button type="button" aria-label="Bold" aria-pressed={editor.isActive('bold')} onMouseDown={keep} onClick={() => editor.toggleMark('bold')} className={`${small} ${touch ? 'h-11 w-11' : 'h-8 w-8'} ${editor.isActive('bold') ? 'text-primary-default' : ''}`}>
            <BoldIcon className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" aria-label="Italic" aria-pressed={editor.isActive('italic')} onMouseDown={keep} onClick={() => editor.toggleMark('italic')} className={`${small} ${touch ? 'h-11 w-11' : 'h-8 w-8'} ${editor.isActive('italic') ? 'text-primary-default' : ''}`}>
            <ItalicIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}

      <div
        ref={editor.mount}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        aria-label="Document body"
        spellCheck
        data-placeholder={PLACEHOLDER}
        onInput={editor.handleInput}
        className="doc-prose focus:outline-none"
      />

      {empty && (
        <div className="mt-6 rounded-2xl border border-dashed border-border-default p-5">
          <p className="text-sm font-medium text-text-primary">A few ways to begin</p>
          <ul className="mt-3 space-y-2">
            <li>
              <button
                type="button"
                onMouseDown={keep}
                onClick={() => editor.setBlock('H2')}
                className={`flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left hover:bg-background-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${touch ? 'min-h-11' : ''}`}
              >
                <Heading2Icon className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />
                <span>
                  <span className="block text-sm text-text-primary">Start with a section heading</span>
                  <span className="block text-xs text-text-secondary">For example “The short version” or “Examples from class”.</span>
                </span>
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={onAskOutline}
                className={`flex w-full items-start gap-3 rounded-xl px-2 py-2 text-left hover:bg-background-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${touch ? 'min-h-11' : ''}`}
              >
                <ListChecksIcon className="mt-0.5 h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />
                <span>
                  <span className="block text-sm text-text-primary">Ask the tutor for an outline</span>
                  <span className="block text-xs text-text-secondary">The tutor reads this draft only when you send a message — even before you Save.</span>
                </span>
              </button>
            </li>
          </ul>
          <p className="mt-4 flex items-start gap-2 border-t border-border-default pt-3 text-xs leading-5 text-text-tertiary">
            <CloudCheckIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            Your draft is recovered privately as you type. Add a title and some text to Save it to Knowledge.
          </p>
        </div>
      )}
    </div>
  );
}

