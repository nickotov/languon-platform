import React, { forwardRef } from 'react';
import { AlertTriangleIcon, ChevronDownIcon, ChevronUpIcon, Loader2Icon } from 'lucide-react';
import { TutorMark } from './TutorMark';
import { useTutorContext } from '../../contexts/TutorContext';

export type PillStatus = 'idle' | 'responding' | 'ready' | 'interrupted';

export function usePillStatus(): PillStatus {
  const { tutor } = useTutorContext();
  if (tutor.state.streaming) return 'responding';
  if (tutor.state.interrupted) return 'interrupted';
  if (tutor.state.unread) return 'ready';
  return 'idle';
}

const labels: Record<PillStatus, string> = {
  idle: 'Language tutor',
  responding: 'Responding…',
  ready: 'Answer ready',
  interrupted: 'Answer interrupted',
};

interface FoldedPillProps {
  onExpand: () => void;
  placement: 'top' | 'bottom';
  style?: React.CSSProperties;
  className?: string;
}

export const FoldedPill = forwardRef<HTMLButtonElement, FoldedPillProps>(function FoldedPill(
  { onExpand, placement, style, className = '' },
  ref,
) {
  const status = usePillStatus();
  const Chevron = placement === 'top' ? ChevronDownIcon : ChevronUpIcon;
  return (
    <button
      ref={ref}
      type="button"
      onClick={onExpand}
      style={style}
      aria-label={`Open language tutor${status === 'idle' ? '' : ` — ${labels[status]}`}`}
      className={`inline-flex h-12 items-center gap-2.5 rounded-full border border-border-default bg-background-elevated pl-2 pr-3.5 text-sm shadow-md transition-colors hover:border-border-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 ${className}`}
    >
      <span className="relative">
        <TutorMark />
        {status === 'ready' && (
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-background-elevated bg-primary-default" aria-hidden="true" />
        )}
      </span>
      <span className="flex items-center gap-1.5">
        {status === 'responding' && <Loader2Icon className="h-3.5 w-3.5 animate-spin text-text-tertiary" aria-hidden="true" />}
        {status === 'interrupted' && <AlertTriangleIcon className="h-3.5 w-3.5 text-warning-default" aria-hidden="true" />}
        <span className={`font-medium ${status === 'idle' ? 'text-text-primary' : status === 'ready' ? 'text-primary-default' : 'text-text-secondary'}`}>
          {labels[status]}
        </span>
      </span>
      <Chevron className="h-4 w-4 text-text-tertiary" aria-hidden="true" />
    </button>
  );
});

