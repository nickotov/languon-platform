import React from 'react';
import { MessageSquareIcon } from 'lucide-react';

interface DocChatSheetProps {
  open: boolean;
  expanded: boolean;
  height: number;
  bottom: number;
  launcherBottom: number;
  hasAttachment: boolean;
  onOpen: () => void;
  onToggleExpanded: () => void;
  launcherRef: React.RefObject<HTMLButtonElement>;
  children: React.ReactNode;
}

/** Mobile: tutor chat as a bottom sheet with a launcher when closed. */
export function DocChatSheet({ open, expanded, height, bottom, launcherBottom, hasAttachment, onOpen, onToggleExpanded, launcherRef, children }: DocChatSheetProps) {
  return (
    <>
      <section
        aria-label="Tutor chat"
        aria-hidden={!open}
        style={{ height, bottom }}
        className={`absolute inset-x-0 z-30 flex flex-col overflow-hidden rounded-t-3xl border border-b-0 border-border-default bg-background-surface shadow-lg transition-all duration-200 ${
          open ? '' : 'pointer-events-none invisible'
        }`}
      >
        <button
          type="button"
          onClick={onToggleExpanded}
          aria-label={expanded ? 'Reduce chat sheet' : 'Expand chat sheet'}
          className="flex h-6 w-full shrink-0 items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus"
        >
          <span className="h-1 w-10 rounded-full bg-border-strong" aria-hidden="true" />
        </button>
        <div className="min-h-0 flex-1">{children}</div>
      </section>
      {!open && (
        <button
          ref={launcherRef}
          type="button"
          onClick={onOpen}
          style={{ bottom: launcherBottom }}
          className="absolute right-4 z-30 inline-flex h-12 items-center gap-2 rounded-full border border-border-default bg-background-elevated pl-3 pr-4 text-sm font-medium text-text-primary shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2"
        >
          <span className="relative">
            <MessageSquareIcon className="h-4 w-4 text-primary-default" aria-hidden="true" />
            {hasAttachment && <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-primary-default" aria-hidden="true" />}
          </span>
          Tutor
          {hasAttachment && <span className="sr-only">(passage attached)</span>}
        </button>
      )}
    </>
  );
}

