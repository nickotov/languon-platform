import React, { useState } from 'react';
import { CheckIcon, CopyIcon } from 'lucide-react';
import { format } from 'date-fns';
import type { SavedVersion } from '../../types/document';
import { Popover, PopoverAnchor, PopoverContent } from '../Popover';
import { Button } from '../Button';
import { SHARE_LINK } from '../../hooks/useDocState';
import { ru } from '../../data/strings';

interface SharePopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Element the popover is anchored to (the document actions menu). */
  anchor: React.ReactNode;
  saved: SavedVersion;
  enabled: boolean;
  dirty: boolean;
  onEnable: () => void;
  onDisable: () => void;
  onCopied: () => void;
}

/** Read-only sharing, subordinate to writing: opened from the document actions menu. */
export function SharePopover({ open, onOpenChange, anchor, saved, enabled, dirty, onEnable, onDisable, onCopied }: SharePopoverProps) {
  const [copied, setCopied] = useState(false);
  const [confirmDisable, setConfirmDisable] = useState(false);
  const savedTime = format(saved.savedAt, 'HH:mm');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(SHARE_LINK);
    } catch {
      /* clipboard unavailable in some previews */
    }
    setCopied(true);
    onCopied();
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        if (!o) setConfirmDisable(false);
        onOpenChange(o);
      }}
    >
      <PopoverAnchor asChild>{anchor}</PopoverAnchor>
      <PopoverContent align="end" collisionPadding={12} className="w-80 p-4" onFocusOutside={(e: Event) => e.preventDefault()}>
        <p className="text-sm font-semibold text-text-primary">{ru.share.title}</p>
        <p className="mt-1 text-xs leading-5 text-text-secondary">{ru.share.body(savedTime)}</p>
        {enabled ? (
          <>
            <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-border-default bg-background-subtle pl-2.5">
              <span className="min-w-0 flex-1 truncate text-xs text-text-primary">{SHARE_LINK}</span>
              <button
                type="button"
                onClick={copy}
                className="inline-flex h-9 shrink-0 items-center gap-1 rounded-r-lg border-l border-border-default px-2.5 text-xs font-medium text-text-primary hover:bg-background-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              >
                {copied ? <CheckIcon className="h-3.5 w-3.5" aria-hidden="true" /> : <CopyIcon className="h-3.5 w-3.5" aria-hidden="true" />}
                {copied ? ru.share.copied : ru.share.copy}
              </button>
            </div>
            {dirty && <p className="mt-2 text-xs leading-5 text-warning-default">{ru.share.dirty(savedTime)}</p>}
            <div className="mt-3 border-t border-border-default pt-3">
              {confirmDisable ? (
                <div>
                  <p className="text-xs text-text-secondary">{ru.share.disableConfirm}</p>
                  <div className="mt-2 flex gap-1.5">
                    <Button
                      size="compact"
                      variant="danger"
                      onClick={() => {
                        onDisable();
                        setConfirmDisable(false);
                      }}
                    >
                      {ru.share.disable}
                    </Button>
                    <Button size="compact" variant="ghost" onClick={() => setConfirmDisable(false)}>
                      {ru.share.keep}
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDisable(true)}
                  className="text-xs font-medium text-text-secondary underline-offset-2 hover:text-danger-default hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                >
                  {ru.share.disableLink}
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="mt-3">
            <Button size="compact" variant="secondary" onClick={onEnable}>
              {ru.share.enable}
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

