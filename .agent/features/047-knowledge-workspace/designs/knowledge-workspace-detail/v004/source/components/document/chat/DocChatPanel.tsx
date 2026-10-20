import React, { useEffect, useRef } from 'react';
import type { RichEditor } from '../../../utils/richEditor';
import type { DocChatApi } from '../../../hooks/useDocChat';
import { ChatHeader } from './ChatHeader';
import { ChatEmptyState } from './ChatEmptyState';
import { ChatMessage } from './ChatMessage';
import { DocChatComposer } from './DocChatComposer';
import { ru } from '../../../data/strings';

interface DocChatPanelProps {
  chat: DocChatApi;
  editor: RichEditor | null;
  mobile: boolean;
  docTitle: string;
  docChars: number;
  docEmpty: boolean;
  /** Message whose suggestion is open in the document (review panel or inline). */
  activeSuggestionId: string | null;
  inlineCapable: boolean;
  composerRef: React.RefObject<HTMLTextAreaElement>;
  onClose?: () => void;
  onUseInDocument: (messageId: string) => void;
  onShowInline: (messageId: string) => void;
  onComposerFocus?: (focused: boolean) => void;
}

export function DocChatPanel(p: DocChatPanelProps) {
  const { chat, mobile } = p;
  const listRef = useRef<HTMLDivElement>(null);
  const last = chat.messages[chat.messages.length - 1];
  const lastTutor = [...chat.messages].reverse().find((m) => m.role === 'tutor');
  const selectionOnly = chat.prefs.context === 'selection' && chat.passage !== null;

  // Follow new text only while the reader is already near the bottom.
  useEffect(() => {
    const el = listRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 140) el.scrollTop = el.scrollHeight;
  }, [chat.messages.length, last?.revealed, last?.status]);

  const announce =
    lastTutor?.status === 'reading'
      ? ru.chat.reading
      : lastTutor?.status === 'preparing'
        ? ru.chat.preparing
        : lastTutor?.status === 'done'
          ? ru.chat.ready
          : lastTutor?.status === 'stopped' || lastTutor?.status === 'failed'
            ? ru.chat.incomplete
            : '';

  return (
    <div className="flex h-full min-h-0 flex-col bg-background-surface">
      <ChatHeader
        mobile={mobile}
        docTitle={p.docTitle}
        docChars={p.docChars}
        docLimit={chat.docLimit}
        selectionOnly={selectionOnly}
        canReset={chat.messages.length > 0}
        onNew={() => chat.newConversation(p.editor)}
        onClose={p.onClose}
      />
      <p className="sr-only" role="status" aria-live="polite">
        {announce}
      </p>
      <div ref={listRef} role="log" aria-label={ru.chat.logLabel} aria-live="off" className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-4">
        {chat.messages.length === 0 && (
          <ChatEmptyState
            newDoc={p.docEmpty}
            touch={mobile}
            onPrompt={(t) => {
              chat.setText(t);
              window.requestAnimationFrame(() => p.composerRef.current?.focus());
            }}
          />
        )}
        {chat.messages.map((m) => (
          <ChatMessage
            key={m.id}
            message={m}
            touch={mobile}
            busy={chat.streaming}
            active={p.activeSuggestionId === m.id}
            inlineCapable={p.inlineCapable}
            onRetry={chat.retry}
            onShowInline={p.onShowInline}
            onUse={p.onUseInDocument}
          />
        ))}
      </div>
      <DocChatComposer chat={chat} editor={p.editor} touch={mobile} docChars={p.docChars} composerRef={p.composerRef} onFocusChange={p.onComposerFocus} />
    </div>
  );
}

