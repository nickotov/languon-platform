import React, { useEffect, useRef } from 'react';
import { ArrowLeftIcon, CopyPlusIcon, EllipsisVerticalIcon, HistoryIcon, MessageSquareIcon, Trash2Icon } from 'lucide-react';
import { format } from 'date-fns';
import type { DocStateApi } from '../../hooks/useDocState';
import { Button } from '../Button';
import { Badge } from '../Badge';
import { Tooltip } from '../Tooltip';
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../DropdownMenu';
import { RecoveryIndicator } from './RecoveryIndicator';
import { SharePopover } from './SharePopover';

interface DocTopBarProps {
  doc: DocStateApi;
  mobile: boolean;
  chatClosed: boolean;
  onBack: () => void;
  onOpenChat: () => void;
  onSaveCopy: () => void;
}

export function DocTopBar({ doc, mobile, chatClosed, onBack, onOpenChat, onSaveCopy }: DocTopBarProps) {
  const titleRef = useRef<HTMLInputElement>(null);
  const status = doc.saved === null ? 'draft' : doc.dirty ? 'edited' : 'saved';
  const saveHint = doc.missingTitle && doc.missingBody
    ? 'Add a title and some text to save'
    : doc.missingTitle
      ? 'Add a title to save'
      : doc.missingBody
        ? 'Write something to save'
        : !doc.dirty && doc.saved
          ? 'No changes since last save'
          : `Save (${/Mac/.test(navigator.platform) ? '⌘' : 'Ctrl+'}S)`;

  useEffect(() => {
    const el = titleRef.current;
    if (!el) return;
    el.style.width = '0px';
    el.style.width = `${Math.min(el.scrollWidth + 4, 560)}px`;
  }, [doc.title]);

  return (
    <header className={`flex shrink-0 items-center gap-2 border-b border-border-default bg-background-surface ${mobile ? 'h-14 px-1.5' : 'h-14 px-4'}`}>
      <button
        type="button"
        onClick={onBack}
        aria-label="Back to Knowledge"
        className={`inline-flex shrink-0 items-center gap-1.5 rounded-lg text-sm text-text-secondary hover:bg-background-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${mobile ? 'h-11 w-11 justify-center' : 'h-9 px-2'}`}
      >
        <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
        {!mobile && <span className="hidden lg:inline">Knowledge</span>}
      </button>
      {!mobile && <span aria-hidden="true" className="h-5 w-px bg-border-default" />}

      <div className="flex min-w-0 flex-1 items-center gap-2">
        <label htmlFor="doc-title" className="sr-only">
          Document title
        </label>
        <input
          id="doc-title"
          ref={titleRef}
          value={doc.title}
          onChange={(e) => doc.changeTitle(e.target.value)}
          placeholder="Untitled draft"
          aria-required="true"
          aria-invalid={doc.missingTitle && !doc.missingBody}
          className={`min-w-0 max-w-full truncate rounded-md bg-transparent px-1.5 py-1 font-semibold text-text-primary placeholder:font-normal placeholder:text-text-tertiary hover:bg-background-subtle focus:bg-background-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${mobile ? 'flex-1 text-sm' : 'text-base'}`}
          style={{ minWidth: mobile ? undefined : 120 }}
        />
        {!mobile && (
          <Badge size="sm" tone={status === 'saved' ? 'success' : status === 'edited' ? 'warning' : 'neutral'} className="shrink-0">
            {status === 'draft' ? 'Draft' : status === 'saved' ? `Saved ${format(doc.saved!.savedAt, 'HH:mm')}` : 'Unsaved edits'}
          </Badge>
        )}
        <RecoveryIndicator state={doc.recovery} recoveredAt={doc.recoveredAt} onRetry={doc.retryRecovery} compact={mobile} />
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {doc.saved && (
          <SharePopover
            saved={doc.saved}
            enabled={doc.sharingEnabled}
            dirty={doc.dirty}
            touch={mobile}
            onEnable={() => {
              doc.setSharingEnabled(true);
              doc.notify({ variant: 'info', title: 'Sharing enabled', description: 'Anyone with the link can read the last saved version.' });
            }}
            onDisable={() => {
              doc.setSharingEnabled(false);
              doc.notify({ variant: 'info', title: 'Sharing disabled', description: 'The read-only link no longer works.' });
            }}
            onCopied={() => doc.notify({ variant: 'success', title: 'Link copied' })}
          />
        )}
        {!mobile && chatClosed && (
          <button
            type="button"
            onClick={onOpenChat}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm text-text-secondary hover:bg-background-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            <MessageSquareIcon className="h-4 w-4" aria-hidden="true" />
            Tutor
          </button>
        )}
        <DropdownMenu
          align="end"
          menuClassName="w-56"
          trigger={
            <DropdownMenuTrigger
              hideChevron
              aria-label="Document actions"
              className={`inline-flex items-center justify-center rounded-lg !border-0 !bg-transparent !p-0 !shadow-none text-text-secondary hover:!bg-background-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${mobile ? '!h-11 !w-11' : '!h-9 !w-9'}`}
            >
              <EllipsisVerticalIcon className="h-4 w-4" aria-hidden="true" />
            </DropdownMenuTrigger>
          }
        >
          <DropdownMenuItem icon={<CopyPlusIcon className="h-4 w-4" />} disabled={doc.missingTitle || doc.missingBody} onSelect={onSaveCopy}>
            Save a copy
          </DropdownMenuItem>
          <DropdownMenuItem icon={<HistoryIcon className="h-4 w-4" />} disabled={!doc.saved} onSelect={doc.openHistory}>
            Revision history
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem destructive icon={<Trash2Icon className="h-4 w-4" />} onSelect={() => doc.setDialog('delete')}>
            Delete…
          </DropdownMenuItem>
        </DropdownMenu>
        <Tooltip content={saveHint} placement="bottom">
          <span className="inline-flex">
            <Button
              size={mobile ? 'compact' : 'compact'}
              onClick={() => doc.save()}
              disabled={!doc.canSave}
              loading={doc.saving}
              aria-describedby="save-hint"
              className={mobile ? 'min-h-11 px-3' : 'px-4'}
            >
              Save
            </Button>
          </span>
        </Tooltip>
        <span id="save-hint" className="sr-only">
          {saveHint}
        </span>
      </div>
    </header>
  );
}

