import React, { useState } from 'react';
import { ArrowLeftIcon, CopyPlusIcon, EllipsisVerticalIcon, GlobeIcon, HistoryIcon, LinkIcon, SparklesIcon, Trash2Icon } from 'lucide-react';
import type { LayoutMode, MobileTab } from '../../types/document';
import type { DocStateApi } from '../../hooks/useDocState';
import { Button } from '../Button';
import { Tooltip } from '../Tooltip';
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../DropdownMenu';
import { SaveStatus } from './SaveStatus';
import { SharePopover } from './SharePopover';
import { LayoutSwitch } from './LayoutSwitch';
import { ru } from '../../data/strings';

interface DocTopBarProps {
  doc: DocStateApi;
  mobile: boolean;
  compact: boolean;
  /** The in-canvas title has scrolled out of view. */
  showTitle: boolean;
  layoutMode: LayoutMode;
  allowChatMode: boolean;
  onLayout: (mode: LayoutMode) => void;
  onBack: () => void;
  onSaveCopy: () => void;
  stats: string;
  mobileTab: MobileTab;
  onMobileTab: (tab: MobileTab) => void;
  tutorUnread: boolean;
}

export function DocTopBar(p: DocTopBarProps) {
  const { doc, mobile } = p;
  const [shareOpen, setShareOpen] = useState(false);
  const saveHint =
    doc.missingTitle && doc.missingBody
      ? ru.saveHint.missingBoth
      : doc.missingTitle
        ? ru.saveHint.missingTitle
        : doc.missingBody
          ? ru.saveHint.missingBody
          : !doc.dirty && doc.saved
            ? ru.saveHint.noChanges
            : ru.saveHint.save;
  const iconBtn = `inline-flex shrink-0 items-center justify-center rounded-lg text-text-secondary hover:bg-background-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${mobile ? 'h-11 w-11' : 'h-8 w-8'}`;

  const menu = (
    <DropdownMenu
      align="end"
      menuClassName="w-60"
      trigger={
        <DropdownMenuTrigger
          hideChevron
          aria-label={ru.topBar.menu}
          className={`inline-flex items-center justify-center rounded-lg !border-0 !bg-transparent !p-0 !shadow-none text-text-secondary hover:!bg-background-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${mobile ? '!h-11 !w-11' : '!h-8 !w-8'}`}
        >
          <EllipsisVerticalIcon className="h-4 w-4" aria-hidden="true" />
        </DropdownMenuTrigger>
      }
    >
      <DropdownMenuItem icon={<CopyPlusIcon className="h-4 w-4" />} disabled={doc.missingTitle || doc.missingBody} onSelect={p.onSaveCopy}>
        {ru.topBar.saveCopy}
      </DropdownMenuItem>
      <DropdownMenuItem icon={<HistoryIcon className="h-4 w-4" />} disabled={!doc.saved} onSelect={doc.openHistory}>
        {ru.topBar.history}
      </DropdownMenuItem>
      <DropdownMenuItem icon={<LinkIcon className="h-4 w-4" />} disabled={!doc.saved} onSelect={() => window.setTimeout(() => setShareOpen(true), 0)}>
        {ru.topBar.share}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <p className="px-3 py-1.5 text-xs text-text-tertiary">{p.stats}</p>
      <DropdownMenuSeparator />
      <DropdownMenuItem destructive icon={<Trash2Icon className="h-4 w-4" />} onSelect={() => doc.setDialog('delete')}>
        {ru.topBar.delete}
      </DropdownMenuItem>
    </DropdownMenu>
  );

  const menuWithShare = doc.saved ? (
    <SharePopover
      open={shareOpen}
      onOpenChange={setShareOpen}
      anchor={<span className="inline-flex">{menu}</span>}
      saved={doc.saved}
      enabled={doc.sharingEnabled}
      dirty={doc.dirty}
      onEnable={() => {
        doc.setSharingEnabled(true);
        doc.notify({ variant: 'info', title: ru.toasts.sharingOn, description: ru.toasts.sharingOnBody });
      }}
      onDisable={() => {
        doc.setSharingEnabled(false);
        doc.notify({ variant: 'info', title: ru.toasts.sharingOff, description: ru.toasts.sharingOffBody });
      }}
      onCopied={() => doc.notify({ variant: 'success', title: ru.toasts.linkCopied })}
    />
  ) : (
    menu
  );

  const sharedBtn = doc.saved && doc.sharingEnabled && (
    <Tooltip content={ru.topBar.sharedAria} placement="bottom">
      <button type="button" aria-label={ru.topBar.sharedAria} onClick={() => setShareOpen(true)} className={iconBtn}>
        <GlobeIcon className="h-4 w-4 text-primary-default" aria-hidden="true" />
      </button>
    </Tooltip>
  );

  const save = (
    <Tooltip content={saveHint} placement="bottom">
      <span className="inline-flex shrink-0">
        <Button
          size="compact"
          variant={doc.canSave ? 'primary' : 'secondary'}
          onClick={() => doc.save()}
          disabled={!doc.canSave}
          loading={doc.saving}
          aria-describedby="save-hint"
          className={mobile ? 'min-h-11 px-3' : 'px-3.5'}
        >
          {ru.topBar.save}
        </Button>
      </span>
    </Tooltip>
  );
  const hint = (
    <span id="save-hint" className="sr-only">
      {saveHint}
    </span>
  );

  if (mobile) {
    const tabs: { id: MobileTab; label: string }[] = [
      { id: 'doc', label: ru.topBar.tabDoc },
      { id: 'tutor', label: ru.topBar.tabTutor },
    ];
    return (
      <header className="shrink-0 border-b border-border-default bg-background-surface">
        <div className="flex h-12 items-center gap-1 px-1.5">
          <button type="button" onClick={p.onBack} aria-label={ru.topBar.backAria} className={iconBtn}>
            <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
          </button>
          <div className="min-w-0 flex-1">
            <SaveStatus doc={doc} compact />
          </div>
          {save}
          {menuWithShare}
          {hint}
        </div>
        <div
          role="tablist"
          aria-label={ru.topBar.tabsLabel}
          className="flex gap-1 px-2 pb-1.5"
          onKeyDown={(e) => {
            if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
            const next = p.mobileTab === 'doc' ? 'tutor' : 'doc';
            p.onMobileTab(next);
            window.requestAnimationFrame(() => document.getElementById(`tab-${next}`)?.focus());
          }}
        >
          {tabs.map((t) => {
            const on = p.mobileTab === t.id;
            return (
              <button
                key={t.id}
                id={`tab-${t.id}`}
                type="button"
                role="tab"
                aria-selected={on}
                aria-controls={`panel-${t.id}`}
                tabIndex={on ? 0 : -1}
                onClick={() => p.onMobileTab(t.id)}
                className={`relative inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${
                  on ? 'bg-background-subtle font-semibold text-text-primary' : 'text-text-secondary hover:bg-background-subtle'
                }`}
              >
                {t.id === 'tutor' && <SparklesIcon className="h-4 w-4 text-primary-default" aria-hidden="true" />}
                {t.label}
                {t.id === 'tutor' && p.tutorUnread && !on && (
                  <span className="h-2 w-2 rounded-full bg-primary-default">
                    <span className="sr-only">{ru.topBar.newReply}</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </header>
    );
  }

  return (
    <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-border-default bg-background-surface px-3">
      <button
        type="button"
        onClick={p.onBack}
        aria-label={ru.topBar.backAria}
        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm text-text-secondary hover:bg-background-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
      >
        <ArrowLeftIcon className="h-4 w-4" aria-hidden="true" />
        <span>{ru.topBar.back}</span>
      </button>
      <div aria-hidden={!p.showTitle} className={`flex min-w-0 flex-1 items-center gap-1.5 transition-opacity duration-200 ${p.showTitle ? 'opacity-100' : 'opacity-0'}`}>
        <span className="text-text-disabled">/</span>
        <p className="truncate text-sm font-medium text-text-primary">{doc.title.trim() || ru.common.untitled}</p>
      </div>
      <SaveStatus doc={doc} compact={p.compact} />
      {sharedBtn}
      {save}
      {menuWithShare}
      {hint}
      <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-border-default" />
      {p.layoutMode === 'focus' && !p.compact && (
        <button
          type="button"
          onClick={() => p.onLayout('split')}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm text-text-secondary hover:bg-background-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
        >
          <SparklesIcon className="h-4 w-4 text-primary-default" aria-hidden="true" />
          {ru.topBar.openTutor}
        </button>
      )}
      <LayoutSwitch mode={p.layoutMode} allowChat={p.allowChatMode} onChange={p.onLayout} />
    </header>
  );
}

