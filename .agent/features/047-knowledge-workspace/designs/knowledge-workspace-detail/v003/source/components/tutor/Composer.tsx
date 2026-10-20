import React, { useLayoutEffect, useState } from 'react';
import { ArrowUpIcon, PlusIcon, SquareIcon, TextSelectIcon } from 'lucide-react';
import type { Conversation, SourceInfo } from '../../types/tutor';
import { AttachmentTray } from './AttachmentTray';
import { ContextPicker } from './ContextPicker';
import { ComposerAlerts } from './ComposerAlerts';
import { ModelPicker, PreferenceControls } from './PreferenceControls';
import { ATTACHMENT_LIMIT, uid } from '../../utils/tutorReducer';
import { isRtl } from '../../utils/richText';
import { useTutorContext } from '../../contexts/TutorContext';

const PASTE_TO_CHIP = 280;

export function Composer({ conversation, source }: { conversation: Conversation; source: SourceInfo }) {
  const { tutor, platform, composerRef, onSelectFromPage, ui, setUi } = useTutorContext();
  const [pickerOpen, setPickerOpen] = useState(false);
  const touch = platform === 'mobile';
  const { text, attachments } = conversation.composer;
  const streaming = tutor.state.streaming !== null;
  const canSend = !streaming && (text.trim().length > 0 || attachments.length > 0);
  const maxHeight = touch ? 120 : 168;

  useLayoutEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, [text, composerRef, maxHeight]);

  const send = () => {
    if (!canSend) return;
    tutor.send(ui.hasUnsavedEdits);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
      return;
    }
    if (e.key === '/') {
      const el = e.currentTarget;
      const before = el.value.slice(0, el.selectionStart);
      if (before === '' || /\s$/.test(before)) {
        e.preventDefault();
        setPickerOpen(true);
      }
    }
  };

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = e.clipboardData.getData('text');
    if (pasted.length <= PASTE_TO_CHIP || attachments.length >= ATTACHMENT_LIMIT) return;
    e.preventDefault();
    const truncated = pasted.length > 1200;
    tutor.addAttachment({
      id: uid('paste'),
      kind: 'pasted',
      label: pasted.trim().slice(0, 32),
      text: truncated ? pasted.slice(0, 1200) : pasted,
      origin: 'Pasted from elsewhere',
      external: true,
      dir: isRtl(pasted) ? 'rtl' : 'ltr',
      truncated,
      originalLength: pasted.length,
    });
  };

  const closePicker = () => {
    setPickerOpen(false);
    window.requestAnimationFrame(() => composerRef.current?.focus());
  };

  const iconBtn = `inline-flex items-center gap-1.5 rounded-lg text-xs font-medium text-text-secondary transition-colors hover:bg-background-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${touch ? 'h-11 px-2.5' : 'h-8 px-2'}`;

  return (
    <div className="relative border-t border-border-default bg-background-surface px-3 pb-2 pt-3">
      {pickerOpen && <ContextPicker sourceId={conversation.sourceId} attached={attachments} onClose={closePicker} />}
      <ComposerAlerts source={source} />
      <AttachmentTray attachments={attachments} />

      <div className="rounded-2xl border border-border-default bg-background-surface transition-colors focus-within:border-border-focus focus-within:ring-2 focus-within:ring-primary-100">
        <label htmlFor={`composer-${conversation.id}`} className="sr-only">
          Ask the tutor
        </label>
        <textarea
          id={`composer-${conversation.id}`}
          ref={composerRef}
          rows={1}
          value={text}
          dir="auto"
          onChange={(e) => tutor.setComposer({ text: e.target.value })}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onFocus={() => touch && setUi({ keyboardOpen: true })}
          onBlur={() => touch && setUi({ keyboardOpen: false })}
          placeholder="Ask about a word, phrase, or grammar…"
          aria-describedby={streaming ? `composer-hint-${conversation.id}` : undefined}
          className="block w-full resize-none bg-transparent px-3.5 pt-3 text-base leading-6 text-text-primary placeholder:text-text-tertiary focus:outline-none"
        />
        <div className="flex items-center justify-between gap-2 px-1.5 pb-1.5 pt-1">
          <div className="flex min-w-0 items-center gap-0.5">
            <button
              type="button"
              onClick={() => setPickerOpen((o) => !o)}
              aria-expanded={pickerOpen}
              aria-haspopup="dialog"
              aria-keyshortcuts="/"
              className={iconBtn}
            >
              <PlusIcon className="h-4 w-4" aria-hidden="true" />
              {touch ? <span className="sr-only">Add context</span> : 'Context'}
              {!touch && (
                <kbd className="rounded border border-border-default px-1 font-sans text-xs text-text-tertiary" aria-hidden="true">
                  /
                </kbd>
              )}
            </button>
            {touch && (
              <button type="button" onClick={onSelectFromPage} className={iconBtn}>
                <TextSelectIcon className="h-4 w-4" aria-hidden="true" />
                Select from page
              </button>
            )}
          </div>
          {streaming ? (
            <button
              type="button"
              onClick={tutor.stop}
              className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-border-strong bg-background-surface px-3 text-sm font-medium text-text-primary hover:bg-background-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${touch ? 'h-11' : 'h-9'}`}
            >
              <SquareIcon className="h-3 w-3 fill-current" aria-hidden="true" />
              Stop
            </button>
          ) : (
            <button
              type="button"
              onClick={send}
              disabled={!canSend}
              aria-label="Send question"
              className={`inline-flex shrink-0 items-center justify-center rounded-xl bg-primary-default text-background-surface transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-background-subtle disabled:text-text-disabled ${touch ? 'h-11 w-11' : 'h-9 w-9'}`}
            >
              <ArrowUpIcon className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>

      {streaming && (
        <p id={`composer-hint-${conversation.id}`} className="mt-1.5 px-1 text-xs text-text-tertiary">
          {text.trim() ? 'You can send this once the current answer finishes, or Stop it.' : 'You can type your next question while the tutor answers.'}
        </p>
      )}

      <div className="mt-1 flex items-center justify-between gap-1 overflow-x-auto">
        <PreferenceControls prefs={conversation.prefs} />
        <ModelPicker />
      </div>
    </div>
  );
}

