import React from 'react';
import { AlertTriangleIcon, CheckCircle2Icon, Loader2Icon, Maximize2Icon, RotateCcwIcon } from 'lucide-react';
import type { BlockProposalData, ProposalStatus } from '../../types/blocks';
import { BlockView, blockCountLabel, blockIcons } from './BlockView';
import { ru } from '../../data/strings';

export interface ProposalHandlers {
  statusOf: (messageId: string) => ProposalStatus;
  onApply: (messageId: string) => void;
  onReview: (messageId: string) => void;
  onShowInSheet: (messageId: string) => void;
  onAddSeparate: (messageId: string) => void;
  onAskAgain: (messageId: string) => void;
}

interface ProposalCardProps {
  messageId: string;
  proposal: BlockProposalData;
  touch: boolean;
  handlers: ProposalHandlers;
}

/** Compact chat preview of a structured block proposal with one Apply action for the group. */
export function ProposalCard({ messageId, proposal, touch, handlers }: ProposalCardProps) {
  const status = handlers.statusOf(messageId);
  const first = proposal.blocks[0];
  const Icon = blockIcons[first.type];
  const h = touch ? 'h-11' : 'h-8';
  const btn = `inline-flex items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-50 ${h}`;
  const ghost = `${btn} text-text-secondary hover:bg-background-subtle hover:text-text-primary`;

  return (
    <section aria-label={ru.proposal.label(ru.blocks.types[first.type], blockCountLabel(first))} className="mt-3 rounded-xl border border-border-default">
      <header className="flex items-center gap-2 border-b border-border-default px-3 py-2">
        <Icon className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />
        <p className="min-w-0 flex-1 truncate text-xs font-semibold text-text-primary">
          {ru.blocks.types[first.type]} · {blockCountLabel(first)}
        </p>
        {status === 'applied' ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-success-default">
            <CheckCircle2Icon className="h-3.5 w-3.5" aria-hidden="true" />
            {ru.proposal.applied}
          </span>
        ) : (
          <span className="rounded-full bg-background-subtle px-2 py-0.5 text-xs text-text-secondary">{ru.proposal.notInSheet}</span>
        )}
      </header>

      <div className="px-3 pb-2 pt-1.5">
        {proposal.updatesBlockId && <p className="pb-1 text-xs text-text-tertiary">{ru.proposal.updates(first.title)}</p>}
        {proposal.blocks.map((b) => (
          <div key={b.id}>
            <p className="pb-0.5 text-sm font-medium text-text-primary">{b.title}</p>
            <BlockView block={b} variant="compact" scope={`chat-${messageId}`} />
          </div>
        ))}
      </div>

      <div aria-live="polite">
        {status === 'stale' && (
          <p className="mx-3 mb-2 flex items-start gap-1.5 rounded-lg bg-warning-subtle px-2.5 py-1.5 text-xs leading-5 text-text-primary">
            <AlertTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning-default" aria-hidden="true" />
            {ru.proposal.stale}
          </p>
        )}
        {status === 'failed' && (
          <p className="mx-3 mb-2 flex items-start gap-1.5 rounded-lg bg-danger-subtle px-2.5 py-1.5 text-xs leading-5 text-text-primary">
            <AlertTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger-default" aria-hidden="true" />
            {ru.proposal.failed}
          </p>
        )}
        {status === 'applied' && <p className="px-3 pb-1 text-xs text-text-secondary">{ru.proposal.appliedHint}</p>}
      </div>

      <footer className="flex flex-wrap items-center gap-1 border-t border-border-default px-2 py-1.5">
        {status === 'ready' && (
          <button type="button" onClick={() => handlers.onApply(messageId)} className={`${btn} bg-primary-default text-background-surface hover:bg-primary-hover`}>
            {ru.proposal.apply}
          </button>
        )}
        {status === 'applying' && (
          <button type="button" disabled aria-disabled="true" className={`${btn} bg-primary-default text-background-surface`}>
            <Loader2Icon className="h-4 w-4 animate-spin" aria-hidden="true" />
            {ru.proposal.applying}
          </button>
        )}
        {status === 'failed' && (
          <button type="button" onClick={() => handlers.onApply(messageId)} className={`${btn} bg-primary-default text-background-surface hover:bg-primary-hover`}>
            <RotateCcwIcon className="h-4 w-4" aria-hidden="true" />
            {ru.proposal.retry}
          </button>
        )}
        {status === 'stale' && (
          <>
            <button type="button" onClick={() => handlers.onAddSeparate(messageId)} className={`${btn} border border-border-strong text-text-primary hover:bg-background-subtle`}>
              {ru.proposal.addSeparate}
            </button>
            <button type="button" onClick={() => handlers.onAskAgain(messageId)} className={ghost}>
              {ru.proposal.askAgain}
            </button>
          </>
        )}
        {status === 'applied' && (
          <button type="button" onClick={() => handlers.onShowInSheet(messageId)} className={`${btn} border border-border-strong text-text-primary hover:bg-background-subtle`}>
            {ru.proposal.showInSheet}
          </button>
        )}
        <span className="flex-1" />
        <button type="button" onClick={() => handlers.onReview(messageId)} className={ghost}>
          <Maximize2Icon className="h-3.5 w-3.5" aria-hidden="true" />
          {ru.proposal.review}
        </button>
      </footer>
    </section>
  );
}

