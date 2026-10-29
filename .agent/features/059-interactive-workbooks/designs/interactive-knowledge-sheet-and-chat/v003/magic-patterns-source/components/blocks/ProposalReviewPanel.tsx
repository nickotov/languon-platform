import React from 'react';
import { SparklesIcon } from 'lucide-react';
import type { BlockProposalData, ProposalStatus } from '../../types/blocks';
import { Button } from '../Button';
import { SidePanel } from './SidePanel';
import { BlockView, blockCountLabel } from './BlockView';
import { ru } from '../../data/strings';

interface ProposalReviewPanelProps {
  messageId: string;
  proposal: BlockProposalData;
  status: ProposalStatus;
  mobile: boolean;
  onApply: () => void;
  onClose: () => void;
}

/** Full proposal review: prepared translations, answers and explanations, inspected before Apply. */
export function ProposalReviewPanel({ messageId, proposal, status, mobile, onApply, onClose }: ProposalReviewPanelProps) {
  const first = proposal.blocks[0];
  const canApply = status === 'ready' || status === 'failed';
  return (
    <SidePanel
      title={ru.proposal.reviewTitle}
      subtitle={`${ru.blocks.types[first.type]} · ${blockCountLabel(first)} · ${ru.proposal.notInSheet}`}
      icon={<SparklesIcon className="h-4 w-4" aria-hidden="true" />}
      mobile={mobile}
      container={null}
      onRequestClose={onClose}
      footer={
        <div className="flex flex-wrap items-center gap-2">
          <p className="min-w-0 flex-1 text-xs leading-5 text-text-tertiary">{status === 'applied' ? `${ru.proposal.applied}. ${ru.proposal.appliedHint}` : ru.proposal.appliedToastBody}</p>
          <Button size={mobile ? 'default' : 'compact'} variant="ghost" onClick={onClose}>
            {ru.editor.close}
          </Button>
          {canApply && (
            <Button size={mobile ? 'default' : 'compact'} onClick={onApply}>
              {ru.proposal.apply}
            </Button>
          )}
        </div>
      }
    >
      <p className="mb-4 text-sm leading-6 text-text-secondary">{ru.proposal.reviewNote}</p>
      {proposal.updatesBlockId && <p className="mb-3 text-xs text-text-tertiary">{ru.proposal.updates(first.title)}</p>}
      {proposal.blocks.map((b) => (
        <div key={b.id} className="mb-6">
          <h3 className="mb-1 text-base font-semibold text-text-primary">{b.title}</h3>
          <BlockView block={b} variant="review" scope={`review-${messageId}`} />
        </div>
      ))}
    </SidePanel>
  );
}

