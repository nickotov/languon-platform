import React from 'react';
import { AlertCircleIcon, AlertTriangleIcon, CheckCircle2Icon, CircleIcon, Loader2Icon, LockIcon } from 'lucide-react';
import type { BlockProposalData, ProposalStatus } from '../../types/blocks';
import type { StateTile, StateTone } from '../../data/stateBoard';
import { stateGroups } from '../../data/stateBoard';
import { householdEntries } from '../../data/blockSamples';
import { ProposalCard } from '../blocks/ProposalCard';
import { BoardSection, BoardShell } from './BoardShell';

const toneStyle: Record<StateTone, { wrap: string; icon: React.ReactNode }> = {
  neutral: { wrap: 'bg-background-subtle', icon: <CircleIcon className="h-4 w-4 text-text-tertiary" aria-hidden="true" /> },
  progress: { wrap: 'bg-background-subtle', icon: <Loader2Icon className="h-4 w-4 animate-spin text-primary-default" aria-hidden="true" /> },
  success: { wrap: 'bg-success-subtle', icon: <CheckCircle2Icon className="h-4 w-4 text-success-default" aria-hidden="true" /> },
  warning: { wrap: 'bg-warning-subtle', icon: <AlertTriangleIcon className="h-4 w-4 text-warning-default" aria-hidden="true" /> },
  danger: { wrap: 'bg-danger-subtle', icon: <AlertCircleIcon className="h-4 w-4 text-danger-default" aria-hidden="true" /> },
  private: { wrap: 'bg-primary-subtle', icon: <LockIcon className="h-4 w-4 text-primary-default" aria-hidden="true" /> },
};

const proposal: BlockProposalData = { label: 'Vocabulary', blocks: [{ id: 'sb-vocab', type: 'vocabulary', title: 'Household words', entries: householdEntries.slice(0, 2) }] };
const statuses: ProposalStatus[] = ['ready', 'applying', 'applied', 'stale', 'failed'];
const noop = () => undefined;

/** Compact board of recovery and availability states (KS-19), using the product's own copy. */
export function StateBoard({ mobile }: { mobile: boolean }) {
  return (
    <BoardShell
      mobile={mobile}
      title="States and recovery"
      subtitle="Recovery actions sit next to the affected material, keep local work, and say what will happen. No stack traces, IDs, token counts or provider details appear in product UI. Proposal cards below are the live component."
      nav={[{ id: 'st-proposals', label: 'Proposals' }, ...stateGroups.map((g) => ({ id: g.id, label: g.title }))]}
    >
      <BoardSection id="st-proposals" title="Block proposal · ready → applying → applied, stale, failed">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {statuses.map((s) => (
            <div key={s}>
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-text-tertiary">{s}</p>
              <div className="rounded-2xl border border-border-default bg-background-surface px-3 pb-3">
                <ProposalCard
                  messageId={`sb-${s}`}
                  proposal={s === 'stale' ? { ...proposal, updatesBlockId: 'x', basedOnKey: 'old' } : proposal}
                  touch={mobile}
                  handlers={{ statusOf: () => s, onApply: noop, onReview: noop, onShowInSheet: noop, onAddSeparate: noop, onAskAgain: noop }}
                />
              </div>
            </div>
          ))}
        </div>
      </BoardSection>

      {stateGroups.map((g) => (
        <BoardSection key={g.id} id={g.id} title={g.title} note={g.note}>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {g.tiles.map((t) => (
              <Tile key={t.label} tile={t} />
            ))}
          </div>
        </BoardSection>
      ))}
    </BoardShell>
  );
}

function Tile({ tile }: { tile: StateTile }) {
  const tone = toneStyle[tile.tone];
  return (
    <figure className="flex min-w-0 flex-col rounded-2xl border border-border-default bg-background-surface p-3">
      <figcaption className="mb-2 text-xs font-medium text-text-tertiary">{tile.label}</figcaption>
      <div className={`flex flex-1 items-start gap-2 rounded-xl px-3 py-2.5 ${tone.wrap}`}>
        <span className="mt-0.5 shrink-0">{tone.icon}</span>
        <div className="min-w-0">
          <p className="text-sm font-medium leading-5 text-text-primary">{tile.title}</p>
          {tile.body && <p className="mt-0.5 text-xs leading-5 text-text-secondary">{tile.body}</p>}
          {tile.actions && (
            <div className="mt-2 flex flex-wrap gap-1" aria-hidden="true">
              {tile.actions.map((a) => (
                <span
                  key={a.label}
                  className={`inline-flex h-7 items-center rounded-md px-2 text-xs font-medium ${a.primary ? 'bg-primary-default text-background-surface' : 'border border-border-strong bg-background-surface text-text-primary'}`}
                >
                  {a.label}
                </span>
              ))}
            </div>
          )}
          {tile.actions && <p className="sr-only">Actions: {tile.actions.map((a) => a.label).join(', ')}</p>}
        </div>
      </div>
    </figure>
  );
}

