import React, { useState } from 'react';
import { AlertCircleIcon, CheckIcon, ClipboardIcon, CopyIcon, FileTextIcon, Loader2Icon, RotateCcwIcon } from 'lucide-react';
import type { DocChatMessage } from '../../../types/document';
import { RichBlocks } from '../../tutor/RichBlocks';
import { blocksToText } from '../../../utils/richText';
import { formatChars } from '../../../utils/docCompare';
import { EditSuggestionCard } from './EditSuggestionCard';
import { ProposalCard } from '../../blocks/ProposalCard';
import type { ProposalHandlers } from '../../blocks/ProposalCard';
import { ru } from '../../../data/strings';

interface ChatMessageProps {
  message: DocChatMessage;
  touch: boolean;
  busy: boolean;
  active: boolean;
  inlineCapable: boolean;
  onRetry: (id: string) => void;
  onShowInline: (id: string) => void;
  onUse: (id: string) => void;
  proposals: ProposalHandlers;
}

export function ChatMessage({ message: m, touch, busy, active, inlineCapable, onRetry, onShowInline, onUse, proposals }: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const small = `inline-flex items-center gap-1.5 rounded-md px-1.5 text-xs font-medium text-text-secondary hover:bg-background-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-40 ${touch ? 'h-11' : 'h-7'}`;

  if (m.role === 'user') {
    return (
      <div className="flex flex-col items-end gap-1.5 pl-10">
        {m.passage && (
          <blockquote className="w-full rounded-lg border-l-2 border-primary-default bg-primary-subtle px-2.5 py-1.5">
            <p className="text-xs font-medium text-primary-default">
              {ru.chat.selectedPassage} · {m.passage.blockLabel}
            </p>
            <p className="line-clamp-2 text-xs leading-5 text-text-primary">{m.passage.text}</p>
          </blockquote>
        )}
        {m.references?.map((r) => (
          <p key={r.id} className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-dashed border-border-strong px-2 py-1 text-xs text-text-secondary">
            <ClipboardIcon className="h-3 w-3 shrink-0" aria-hidden="true" />
            <span className="truncate">{r.title}</span>
          </p>
        ))}
        <p className="rounded-2xl rounded-br-md bg-user-message-bg px-3.5 py-2 text-sm leading-6 text-text-primary">{m.text}</p>
      </div>
    );
  }

  const status = m.status ?? 'done';
  const pending = status === 'queued' || status === 'reading' || status === 'preparing';
  const pendingLabel =
    status === 'queued' ? ru.chat.queued : status === 'reading' ? ru.chat.reading : m.proposal ? ru.chat.preparingBlock(m.proposal.label) : ru.chat.preparing;
  const incomplete = status === 'stopped' || status === 'failed';
  const readLabel = m.contextChars !== undefined ? ru.chat.read(ru.common.chars(formatChars(m.contextChars))) : ru.chat.readPlain;

  return (
    <article aria-label={ru.chat.replyLabel} className="text-sm leading-6 text-text-primary">
      {pending ? (
        <p className="flex items-center gap-2 text-text-secondary">
          <Loader2Icon className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          {pendingLabel}
        </p>
      ) : (
        <>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs text-text-tertiary">
            <FileTextIcon className="h-3 w-3" aria-hidden="true" />
            {readLabel}
          </p>
          {m.blocks && <RichBlocks blocks={m.blocks} revealed={status === 'done' ? undefined : m.revealed} />}
        </>
      )}

      {incomplete && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-warning-subtle px-2.5 py-1.5">
          <AlertCircleIcon className="h-4 w-4 shrink-0 text-warning-default" aria-hidden="true" />
          <p className="min-w-0 flex-1 text-xs leading-5 text-text-primary">
            <span className="font-semibold">{ru.chat.incomplete}.</span> {status === 'stopped' ? ru.chat.stopped : ru.chat.failed}
          </p>
          <button type="button" onClick={() => onRetry(m.id)} disabled={busy} className={small}>
            <RotateCcwIcon className="h-3.5 w-3.5" aria-hidden="true" />
            {ru.chat.retry}
          </button>
        </div>
      )}

      {status === 'done' && (
        <>
          {m.proposal && <ProposalCard messageId={m.id} proposal={m.proposal} touch={touch} handlers={proposals} />}
          {m.suggestion && (
            <EditSuggestionCard
              suggestion={m.suggestion}
              active={active}
              touch={touch}
              inlineCapable={inlineCapable}
              onShowInline={() => onShowInline(m.id)}
              onUse={() => onUse(m.id)}
            />
          )}
          <div className="-ml-1.5 mt-1.5 flex items-center gap-1">
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(blocksToText(m.blocks ?? []));
                } catch {
                  /* clipboard unavailable in some previews */
                }
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              }}
              className={small}
            >
              {copied ? <CheckIcon className="h-3.5 w-3.5" aria-hidden="true" /> : <CopyIcon className="h-3.5 w-3.5" aria-hidden="true" />}
              {copied ? ru.chat.copied : ru.chat.copy}
            </button>
          </div>
        </>
      )}
    </article>
  );
}

