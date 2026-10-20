import React, { useEffect, useRef, useState } from 'react';
import type { RichEditor as Editor } from '../../../utils/richEditor';
import {
  CheckIcon,
  ClipboardIcon,
  Columns2Icon,
  CopyIcon,
  FilePenLineIcon,
  Loader2Icon,
  PanelRightIcon,
  PictureInPicture2Icon,
  XIcon,
} from 'lucide-react';
import type { ChatMode } from '../../../types/document';
import type { DocChatApi } from '../../../hooks/useDocChat';
import { RichBlocks } from '../../tutor/RichBlocks';
import { TutorMark } from '../../tutor/TutorMark';
import { DocChatComposer } from './DocChatComposer';
import { blocksToText } from '../../../utils/richText';

interface DocChatPanelProps {
  chat: DocChatApi;
  editor: Editor | null;
  mode: ChatMode;
  mobile: boolean;
  docChars: number;
  reviewId: string | null;
  composerRef: React.RefObject<HTMLTextAreaElement>;
  onModeChange: (mode: ChatMode) => void;
  onClose: () => void;
  onUseInDocument: (messageId: string) => void;
  onComposerFocus?: (focused: boolean) => void;
  onHeaderPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
}

export function DocChatPanel(p: DocChatPanelProps) {
  const { chat, mobile } = p;
  const listRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const last = chat.messages[chat.messages.length - 1];

  useEffect(() => {
    const el = listRef.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 120) el.scrollTop = el.scrollHeight;
  }, [chat.messages.length, last?.revealed]);

  const iconBtn = `inline-flex items-center justify-center rounded-md text-text-secondary hover:bg-background-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${mobile ? 'h-11 w-11' : 'h-8 w-8'}`;

  return (
    <div className="flex h-full min-h-0 flex-col bg-background-surface">
      <div onPointerDown={p.onHeaderPointerDown} className={`flex items-center gap-2 border-b border-border-default px-3 ${mobile ? 'py-1' : 'py-2.5'} ${p.mode === 'floating' ? 'cursor-grab' : ''}`}>
        <TutorMark />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-text-primary">Tutor</h2>
          <p className="truncate text-xs text-text-tertiary">Reads this document when you send</p>
        </div>
        {!mobile && (
          <>
            <button type="button" aria-label={p.mode === 'half' ? 'Narrow chat to side width' : 'Widen chat to half'} title={p.mode === 'half' ? 'Narrow' : 'Widen to half'} onClick={() => p.onModeChange(p.mode === 'half' ? 'docked' : 'half')} className={iconBtn}>
              {p.mode === 'half' ? <PanelRightIcon className="h-4 w-4" aria-hidden="true" /> : <Columns2Icon className="h-4 w-4" aria-hidden="true" />}
            </button>
            <button type="button" aria-label={p.mode === 'floating' ? 'Dock chat to the side' : 'Detach as floating panel'} title={p.mode === 'floating' ? 'Dock' : 'Detach'} onClick={() => p.onModeChange(p.mode === 'floating' ? 'docked' : 'floating')} className={iconBtn}>
              {p.mode === 'floating' ? <PanelRightIcon className="h-4 w-4" aria-hidden="true" /> : <PictureInPicture2Icon className="h-4 w-4" aria-hidden="true" />}
            </button>
          </>
        )}
        <button type="button" aria-label="Close chat" onClick={p.onClose} className={iconBtn}>
          <XIcon className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      <div ref={listRef} role="log" aria-label="Tutor conversation" aria-live="off" className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {chat.messages.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border-default p-4 text-sm leading-6 text-text-secondary">
            <p className="font-medium text-text-primary">Write with the tutor beside you</p>
            <p className="mt-1">Select a passage and choose <span className="font-medium text-text-primary">Ask tutor</span>, or ask about the whole draft. Replies stay here until you choose to use one in the document.</p>
          </div>
        )}
        {chat.messages.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} className="flex flex-col items-end gap-1.5 pl-8">
              {m.passage && (
                <div className="w-full rounded-lg border-l-2 border-primary-default bg-primary-subtle px-2.5 py-1.5">
                  <p className="text-xs font-medium text-primary-default">Selected passage</p>
                  <p lang="es" className="line-clamp-2 text-xs leading-5 text-text-primary">{m.passage.text}</p>
                </div>
              )}
              {m.references?.map((r) => (
                <p key={r.id} className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-dashed border-border-strong px-2 py-1 text-xs text-text-secondary">
                  <ClipboardIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
                  <span className="truncate">{r.title}</span>
                </p>
              ))}
              <p className="rounded-2xl rounded-br-md bg-user-message-bg px-3.5 py-2 text-sm leading-6 text-text-primary">{m.text}</p>
            </div>
          ) : (
            <article key={m.id} aria-label="Tutor reply" className="text-sm leading-6 text-text-primary">
              {m.status === 'reading' ? (
                <p className="flex items-center gap-2 text-text-secondary">
                  <Loader2Icon className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Reading your document…
                </p>
              ) : (
                m.blocks && <RichBlocks blocks={m.blocks} revealed={m.status === 'done' ? undefined : m.revealed} />
              )}
              {m.status === 'done' && (
                <div className="-ml-1.5 mt-2 flex flex-wrap items-center gap-1">
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(blocksToText(m.blocks ?? []));
                      } catch {
                        /* ignore */
                      }
                      setCopied(m.id);
                      window.setTimeout(() => setCopied(null), 1500);
                    }}
                    className={`inline-flex items-center gap-1.5 rounded-md px-1.5 text-xs font-medium text-text-secondary hover:bg-background-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${mobile ? 'h-11' : 'h-7'}`}
                  >
                    {copied === m.id ? <CheckIcon className="h-3.5 w-3.5" aria-hidden="true" /> : <CopyIcon className="h-3.5 w-3.5" aria-hidden="true" />}
                    {copied === m.id ? 'Copied' : 'Copy'}
                  </button>
                  {m.suggestion && (
                    <button
                      type="button"
                      onClick={() => p.onUseInDocument(m.id)}
                      aria-pressed={p.reviewId === m.id}
                      className={`inline-flex items-center gap-1.5 rounded-md border px-2 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${mobile ? 'h-11' : 'h-7'} ${
                        p.reviewId === m.id ? 'border-primary-default bg-primary-subtle text-primary-default' : 'border-border-default text-text-primary hover:bg-background-subtle'
                      }`}
                    >
                      <FilePenLineIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      {p.reviewId === m.id ? 'Reviewing in document' : 'Use in document…'}
                    </button>
                  )}
                </div>
              )}
            </article>
          ),
        )}
      </div>

      <DocChatComposer chat={chat} editor={p.editor} touch={mobile} docChars={p.docChars} composerRef={p.composerRef} onFocusChange={p.onComposerFocus} />
    </div>
  );
}

