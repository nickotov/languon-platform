import React, { useState } from 'react';
import { CheckIcon, CopyIcon, GlobeIcon as Globe2Icon, LinkIcon } from 'lucide-react';
import { format } from 'date-fns';
import type { SavedVersion } from '../../types/document';
import { Popover, PopoverContent, PopoverTrigger } from '../Popover';
import { Button } from '../Button';
import { SHARE_LINK } from '../../hooks/useDocState';

interface SharePopoverProps {
  saved: SavedVersion;
  enabled: boolean;
  dirty: boolean;
  touch: boolean;
  onEnable: () => void;
  onDisable: () => void;
  onCopied: () => void;
}

export function SharePopover({ saved, enabled, dirty, touch, onEnable, onDisable, onCopied }: SharePopoverProps) {
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
    <Popover onOpenChange={(o) => !o && setConfirmDisable(false)}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={enabled ? 'Sharing on — manage read-only link' : 'Share a read-only link'}
          className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm text-text-secondary hover:bg-background-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${touch ? 'h-11 w-11 justify-center' : 'h-9'}`}
        >
          {enabled ? <Globe2Icon className="h-4 w-4 text-primary-default" aria-hidden="true" /> : <LinkIcon className="h-4 w-4" aria-hidden="true" />}
          {!touch && <span>{enabled ? 'Shared' : 'Share'}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" collisionPadding={12} className="w-80 p-4">
        <p className="text-sm font-semibold text-text-primary">Read-only link</p>
        <p className="mt-1 text-xs leading-5 text-text-secondary">
          Readers see only your last saved version (saved {savedTime}). Working drafts and tutor chats always stay private.
        </p>
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
                {copied ? 'Copied' : 'Copy link'}
              </button>
            </div>
            {dirty && (
              <p className="mt-2 text-xs leading-5 text-warning-default">
                You have unsaved edits. Readers keep seeing the {savedTime} version until you Save.
              </p>
            )}
            <div className="mt-3 border-t border-border-default pt-3">
              {confirmDisable ? (
                <div>
                  <p className="text-xs text-text-secondary">The link will stop working for anyone who has it.</p>
                  <div className="mt-2 flex gap-1.5">
                    <Button size="compact" variant="danger" onClick={() => { onDisable(); setConfirmDisable(false); }}>
                      Disable link
                    </Button>
                    <Button size="compact" variant="ghost" onClick={() => setConfirmDisable(false)}>
                      Keep sharing
                    </Button>
                  </div>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmDisable(true)} className="text-xs font-medium text-text-secondary underline-offset-2 hover:text-danger-default hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus">
                  Disable sharing
                </button>
              )}
            </div>
          </>
        ) : (
          <div className="mt-3">
            <Button size="compact" variant="secondary" onClick={onEnable}>
              Enable sharing
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

