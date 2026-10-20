import React from 'react';
import { CloudAlertIcon, CloudCheckIcon, CloudOffIcon, LoaderIcon } from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import type { RecoveryState } from '../../types/document';
import { Popover, PopoverContent, PopoverTrigger } from '../Popover';

interface RecoveryIndicatorProps {
  state: RecoveryState;
  recoveredAt: number;
  onRetry: () => void;
  compact?: boolean;
}

const copy: Record<RecoveryState, string> = {
  recovering: 'Recovering…',
  recovered: 'Draft recovered',
  local: 'On this device only',
  error: 'Recovery paused',
};

export function RecoveryIndicator({ state, recoveredAt, onRetry, compact }: RecoveryIndicatorProps) {
  const Icon = state === 'recovered' ? CloudCheckIcon : state === 'local' ? CloudOffIcon : state === 'error' ? CloudAlertIcon : LoaderIcon;
  const tone = state === 'error' ? 'text-warning-default' : 'text-text-tertiary';
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Private recovery: ${copy[state]}. Details`}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-md px-1.5 text-xs hover:bg-background-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${tone} ${compact ? 'h-11' : 'h-7'}`}
        >
          <Icon className={`h-3.5 w-3.5 ${state === 'recovering' ? 'animate-spin' : ''}`} aria-hidden="true" />
          {!compact && <span aria-live="polite">{copy[state]}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" collisionPadding={12} className="w-72 p-3">
        <p className="text-sm font-medium text-text-primary">Private draft recovery</p>
        <p className="mt-1 text-xs leading-5 text-text-secondary">
          While you write, your working draft is kept privately on our server so nothing is lost if this tab closes. It is
          separate from <span className="font-medium text-text-primary">Save</span>, which updates the version in Knowledge and any
          shared link.
        </p>
        <p className={`mt-2 text-xs font-medium ${tone}`}>
          {state === 'recovered' && `Last recovered ${formatDistanceToNowStrict(recoveredAt, { addSuffix: true })}.`}
          {state === 'recovering' && 'Sending your latest edits…'}
          {state === 'local' && 'You’re offline. Edits are kept in this tab and will be recovered when you reconnect.'}
          {state === 'error' && 'We couldn’t reach the server. Your edits are still in this tab.'}
        </p>
        {state === 'error' && (
          <button type="button" onClick={onRetry} className="mt-2 h-8 rounded-md border border-border-default px-2.5 text-xs font-medium text-text-primary hover:bg-background-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus">
            Retry now
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

