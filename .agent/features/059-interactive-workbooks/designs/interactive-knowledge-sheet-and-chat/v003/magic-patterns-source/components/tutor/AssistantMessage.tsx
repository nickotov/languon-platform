import React, { useState } from 'react';
import {
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  FileTextIcon,
  BookAIcon,
  Loader2Icon,
  NotebookPenIcon,
  RotateCcwIcon,
  StickyNoteIcon,
  WifiOffIcon,
} from 'lucide-react';
import type { AssistantMsg } from '../../types/tutor';
import { Badge } from '../Badge';
import { Button } from '../Button';
import { RichBlocks } from './RichBlocks';
import { blocksToText } from '../../utils/richText';
import { useTutorContext } from '../../contexts/TutorContext';

interface AssistantMessageProps {
  msg: AssistantMsg;
  isNoteSource: boolean;
  hasDraft: boolean;
  busy: boolean;
}

export function AssistantMessage({ msg, isNoteSource, hasDraft, busy }: AssistantMessageProps) {
  const { tutor, platform } = useTutorContext();
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const [usageOpen, setUsageOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const touch = platform === 'mobile';
  const isLive = msg.status === 'preparing' || msg.status === 'working' || msg.status === 'streaming' || msg.status === 'reconnecting';
  const incomplete = msg.status === 'failed' || msg.status === 'stopped';
  const activitiesDone = msg.status !== 'preparing' && msg.status !== 'working';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(blocksToText(msg.blocks, msg.revealed));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <article aria-label={msg.kind === 'draft' ? 'Knowledge draft update' : 'Tutor answer'} className="text-base leading-7 text-text-primary">
      {msg.status === 'preparing' && <StatusLine>Preparing an answer…</StatusLine>}

      {msg.status === 'working' && (
        <ul className="space-y-1" aria-label="Current activity">
          {msg.activities.slice(0, msg.activityIndex).map((a) => (
            <li key={a.done} className="flex items-center gap-2 text-xs text-text-tertiary">
              <CheckIcon className="h-3.5 w-3.5" aria-hidden="true" /> {a.done}
            </li>
          ))}
          <li>
            <StatusLine>{msg.activities[msg.activityIndex]?.running}</StatusLine>
          </li>
        </ul>
      )}

      {activitiesDone && msg.materials.length > 0 && (
        <div className="mb-2">
          <button
            type="button"
            aria-expanded={materialsOpen}
            onClick={() => setMaterialsOpen((o) => !o)}
            className={`-ml-1.5 inline-flex items-center gap-1.5 rounded-md px-1.5 text-xs font-medium text-text-secondary hover:bg-background-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${touch ? 'h-11' : 'h-7'}`}
          >
            {msg.materials[0].kind === 'card' ? (
              <BookAIcon className="h-3.5 w-3.5" aria-hidden="true" />
            ) : msg.materials[0].kind === 'note' ? (
              <StickyNoteIcon className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <FileTextIcon className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            {msg.materialsLabel}
            <ChevronDownIcon className={`h-3.5 w-3.5 transition-transform ${materialsOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
          </button>
          {materialsOpen && (
            <div className="mt-1.5 rounded-xl border border-border-default bg-background-surface p-2">
              <p className="px-1.5 pb-1.5 text-xs text-text-tertiary">Learning material the tutor read — not external citations.</p>
              <ul className="space-y-1">
                {msg.materials.map((m) => (
                  <li key={m.id} className="rounded-lg bg-background-subtle px-2.5 py-2">
                    <p className="text-xs font-semibold text-text-primary">{m.title}</p>
                    <p lang="fr" className="mt-0.5 line-clamp-2 text-xs leading-5 text-text-secondary">
                      {m.excerpt}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {activitiesDone && msg.materials.length === 0 && msg.activities.length > 0 && (
        <p className="mb-2 flex items-center gap-1.5 text-xs text-text-tertiary">
          <CheckIcon className="h-3.5 w-3.5" aria-hidden="true" /> {msg.activities[msg.activities.length - 1].done}
        </p>
      )}

      {msg.revealed > 0 && <RichBlocks blocks={msg.blocks} revealed={msg.status === 'done' ? undefined : msg.revealed} />}

      {msg.status === 'reconnecting' && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-text-tertiary" role="status">
          <WifiOffIcon className="h-3.5 w-3.5" aria-hidden="true" />
          Reconnecting… the answer will continue here.
        </p>
      )}

      {incomplete && (
        <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-border-default bg-background-surface px-3 py-2">
          <Badge tone="warning" size="sm">
            Incomplete
          </Badge>
          <span className="flex-1 text-xs text-text-secondary">
            {msg.status === 'stopped' ? 'You stopped this answer. Not charged.' : 'The connection dropped. Not charged.'}
          </span>
          <Button
            variant="secondary"
            size={touch ? 'default' : 'compact'}
            leadingIcon={<RotateCcwIcon className="h-3.5 w-3.5" />}
            onClick={() => tutor.retry(msg.id)}
            disabled={busy}
          >
            Retry
          </Button>
        </div>
      )}

      {msg.status === 'done' && msg.kind === 'answer' && (
        <div className="mt-2">
          <div className="-ml-1.5 flex flex-wrap items-center gap-0.5">
            <QuietAction touch={touch} onClick={copy} icon={copied ? <CheckIcon className="h-3.5 w-3.5" /> : <CopyIcon className="h-3.5 w-3.5" />}>
              {copied ? 'Copied' : 'Copy'}
            </QuietAction>
            {isNoteSource ? (
              <>
                <QuietAction touch={touch} disabled={busy || hasDraft} onClick={() => tutor.createDraft(msg.id, 'update')} icon={<NotebookPenIcon className="h-3.5 w-3.5" />}>
                  Update this note
                </QuietAction>
                <QuietAction touch={touch} disabled={busy || hasDraft} onClick={() => tutor.createDraft(msg.id, 'new')} icon={<StickyNoteIcon className="h-3.5 w-3.5" />}>
                  Save as a new note
                </QuietAction>
              </>
            ) : (
              <QuietAction touch={touch} disabled={busy || hasDraft} onClick={() => tutor.createDraft(msg.id, 'new')} icon={<NotebookPenIcon className="h-3.5 w-3.5" />}>
                {hasDraft ? 'Draft below' : 'Create Knowledge note'}
              </QuietAction>
            )}
            <QuietAction touch={touch} onClick={() => setUsageOpen((o) => !o)} ariaExpanded={usageOpen} icon={<ChevronDownIcon className={`h-3.5 w-3.5 transition-transform ${usageOpen ? 'rotate-180' : ''}`} />}>
              {msg.usage.credits} credits
            </QuietAction>
          </div>
          {usageOpen && <UsageDetails msg={msg} />}
        </div>
      )}
      {isLive && <span className="sr-only">Answer in progress</span>}
    </article>
  );
}

function UsageDetails({ msg }: { msg: AssistantMsg }) {
  const rows: [string, string][] = [
    ['Model', msg.model],
    ['Credits', `${msg.usage.credits} (reported)`],
    ['Input tokens', msg.usage.inputTokens.toLocaleString('en-US')],
    ['Output tokens', msg.usage.outputTokens.toLocaleString('en-US')],
  ];
  return (
    <dl className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 rounded-xl bg-background-subtle px-3 py-2.5 text-xs">
      {rows.map(([k, v]) => (
        <React.Fragment key={k}>
          <dt className="text-text-tertiary">{k}</dt>
          <dd className="text-right font-medium text-text-primary">{v}</dd>
        </React.Fragment>
      ))}
      <dd className="col-span-2 pt-1 text-text-tertiary">Token counts are reported by the model provider after the answer completes.</dd>
    </dl>
  );
}

export function StatusLine({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-2 text-sm text-text-secondary">
      <Loader2Icon className="h-3.5 w-3.5 animate-spin text-text-tertiary" aria-hidden="true" />
      {children}
    </p>
  );
}

interface QuietActionProps {
  children: React.ReactNode;
  icon: React.ReactNode;
  onClick: () => void;
  touch: boolean;
  disabled?: boolean;
  ariaExpanded?: boolean;
}

function QuietAction({ children, icon, onClick, touch, disabled, ariaExpanded }: QuietActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-expanded={ariaExpanded}
      className={`inline-flex items-center gap-1.5 rounded-md px-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-background-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50 ${touch ? 'h-11' : 'h-8'}`}
    >
      <span aria-hidden="true">{icon}</span>
      {children}
    </button>
  );
}

