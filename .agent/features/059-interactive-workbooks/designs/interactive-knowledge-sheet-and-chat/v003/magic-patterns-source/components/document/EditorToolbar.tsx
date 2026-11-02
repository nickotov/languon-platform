import React, { useEffect, useState } from 'react';
import {
  BoldIcon,
  ChevronDownIcon,
  EllipsisIcon,
  ItalicIcon,
  Link2Icon,
  ListIcon,
  ListOrderedIcon,
  QuoteIcon,
  Redo2Icon,
  StrikethroughIcon,
  TableIcon,
  UnderlineIcon,
  Undo2Icon,
} from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '../Popover';
import { DropdownMenu, DropdownMenuItem, DropdownMenuTrigger } from '../DropdownMenu';
import { Tooltip } from '../Tooltip';
import type { BlockTag, RichEditor } from '../../utils/richEditor';
import { ALT, MOD, SHIFT, ru } from '../../data/strings';

interface EditorToolbarProps {
  editor: RichEditor;
  density: 'full' | 'compact' | 'touch';
}

const blockLabels: Record<BlockTag, string> = { P: ru.toolbar.paragraph, H1: ru.toolbar.h1, H2: ru.toolbar.h2, H3: ru.toolbar.h3 };
const blockShortcut = (n: number) => `${MOD}${ALT}${n}`;

interface ToolProps {
  label: string;
  icon: React.ReactNode;
  btn: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  disabledHint?: string;
  shortcut?: string;
}

function Tool({ label, icon, btn, onClick, active, disabled, disabledHint, shortcut }: ToolProps) {
  const tip = disabled && disabledHint ? disabledHint : shortcut ? `${label} · ${shortcut}` : label;
  return (
    <Tooltip content={tip} placement="bottom">
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        aria-disabled={disabled || undefined}
        aria-keyshortcuts={shortcut}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => !disabled && onClick()}
        className={`inline-flex shrink-0 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${btn} ${
          disabled
            ? 'cursor-not-allowed text-text-disabled'
            : active
              ? 'bg-primary-subtle text-primary-default'
              : 'text-text-secondary hover:bg-background-subtle hover:text-text-primary'
        }`}
      >
        {icon}
      </button>
    </Tooltip>
  );
}

export function EditorToolbar({ editor, density }: EditorToolbarProps) {
  const touch = density === 'touch';
  const btn = touch ? 'h-11 w-11' : 'h-8 w-8';
  const ic = 'h-4 w-4';
  const blockTag = editor.blockTag();
  const inTable = editor.isActive('table');

  const extraMarks = (
    <>
      <Tool btn={btn} label={ru.toolbar.underline} shortcut={`${MOD}U`} icon={<UnderlineIcon className={ic} />} active={editor.isActive('underline')} onClick={() => editor.toggleMark('underline')} />
      <Tool btn={btn} label={ru.toolbar.strike} shortcut={`${MOD}${SHIFT}X`} icon={<StrikethroughIcon className={ic} />} active={editor.isActive('strikeThrough')} onClick={() => editor.toggleMark('strikeThrough')} />
    </>
  );
  const inserts = (
    <>
      <LinkTool editor={editor} btn={btn} />
      <Tool btn={btn} label={ru.toolbar.table} icon={<TableIcon className={ic} />} disabled={inTable} disabledHint={ru.toolbar.tableDisabled} onClick={() => editor.insertTable()} />
    </>
  );
  const sep = <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-border-default" />;

  return (
    <div role="toolbar" aria-label={ru.toolbar.label} className={`flex items-center gap-0.5 ${touch ? 'overflow-x-auto px-2 py-1' : ''}`}>
      <DropdownMenu
        menuClassName="w-56"
        trigger={
          <DropdownMenuTrigger
            hideChevron
            aria-label={ru.toolbar.textStyle(blockLabels[blockTag])}
            className={`inline-flex shrink-0 items-center gap-1 rounded-md !border-0 !bg-transparent px-2 text-sm font-medium !shadow-none text-text-primary hover:!bg-background-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${touch ? '!h-11' : '!h-8'}`}
          >
            <span className="w-28 truncate text-left">{blockLabels[blockTag]}</span>
            <ChevronDownIcon className="h-3.5 w-3.5 text-text-tertiary" aria-hidden="true" />
          </DropdownMenuTrigger>
        }
      >
        <DropdownMenuItem shortcut={blockShortcut(0)} onSelect={() => editor.setBlock('P')}>
          {ru.toolbar.paragraph}
        </DropdownMenuItem>
        <DropdownMenuItem shortcut={blockShortcut(1)} onSelect={() => editor.setBlock('H1')}>
          <span className="text-lg font-semibold">{ru.toolbar.h1}</span>
        </DropdownMenuItem>
        <DropdownMenuItem shortcut={blockShortcut(2)} onSelect={() => editor.setBlock('H2')}>
          <span className="text-base font-semibold">{ru.toolbar.h2}</span>
        </DropdownMenuItem>
        <DropdownMenuItem shortcut={blockShortcut(3)} onSelect={() => editor.setBlock('H3')}>
          <span className="text-sm font-semibold">{ru.toolbar.h3}</span>
        </DropdownMenuItem>
      </DropdownMenu>
      {sep}
      <Tool btn={btn} label={ru.toolbar.bold} shortcut={`${MOD}B`} icon={<BoldIcon className={ic} />} active={editor.isActive('bold')} onClick={() => editor.toggleMark('bold')} />
      <Tool btn={btn} label={ru.toolbar.italic} shortcut={`${MOD}I`} icon={<ItalicIcon className={ic} />} active={editor.isActive('italic')} onClick={() => editor.toggleMark('italic')} />
      {density !== 'compact' && extraMarks}
      {sep}
      <Tool btn={btn} label={ru.toolbar.bullets} shortcut={`${MOD}${SHIFT}8`} icon={<ListIcon className={ic} />} active={editor.isActive('insertUnorderedList')} onClick={() => editor.toggleList('ul')} />
      <Tool btn={btn} label={ru.toolbar.numbers} shortcut={`${MOD}${SHIFT}7`} icon={<ListOrderedIcon className={ic} />} active={editor.isActive('insertOrderedList')} onClick={() => editor.toggleList('ol')} />
      <Tool btn={btn} label={ru.toolbar.quote} shortcut={`${MOD}${SHIFT}9`} icon={<QuoteIcon className={ic} />} active={editor.isActive('blockquote')} onClick={() => editor.toggleQuote()} />
      {density !== 'compact' && (
        <>
          {sep}
          {inserts}
        </>
      )}
      {sep}
      <Tool btn={btn} label={ru.toolbar.undo} shortcut={`${MOD}Z`} icon={<Undo2Icon className={ic} />} onClick={() => editor.undo()} />
      <Tool btn={btn} label={ru.toolbar.redo} shortcut={`${MOD}${SHIFT}Z`} icon={<Redo2Icon className={ic} />} onClick={() => editor.redo()} />
      {density === 'compact' && (
        <Popover>
          <Tooltip content={ru.toolbar.more} placement="bottom">
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label={ru.toolbar.more}
                onMouseDown={(e) => e.preventDefault()}
                className={`inline-flex shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-background-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${btn}`}
              >
                <EllipsisIcon className={ic} aria-hidden="true" />
              </button>
            </PopoverTrigger>
          </Tooltip>
          <PopoverContent align="end" className="flex gap-0.5 p-1" onOpenAutoFocus={(e: Event) => e.preventDefault()}>
            {extraMarks}
            {inserts}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}

function LinkTool({ editor, btn }: { editor: RichEditor; btn: string }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const active = editor.isActive('link');
  const disabled = !editor.hasSelection() && !active;

  useEffect(() => {
    const onOpen = () => {
      if (!editor.hasSelection() && !editor.isActive('link')) return;
      setUrl(editor.linkHref());
      setOpen(true);
    };
    window.addEventListener('doc:open-link', onOpen);
    return () => window.removeEventListener('doc:open-link', onOpen);
  }, [editor]);

  const apply = () => {
    const href = url.trim();
    if (!href) editor.unsetLink();
    else editor.setLink(/^https?:\/\//.test(href) ? href : `https://${href}`);
    setOpen(false);
  };

  const label = active ? ru.toolbar.editLink : ru.toolbar.link;
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        if (o && disabled) return;
        setOpen(o);
        if (o) setUrl(editor.linkHref());
      }}
    >
      <Tooltip content={disabled ? ru.toolbar.linkDisabled : `${label} · ${MOD}K`} placement="bottom">
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={label}
            aria-pressed={active}
            aria-disabled={disabled || undefined}
            aria-keyshortcuts={`${MOD}K`}
            onMouseDown={(e) => e.preventDefault()}
            className={`inline-flex shrink-0 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${btn} ${
              disabled ? 'cursor-not-allowed text-text-disabled' : active ? 'bg-primary-subtle text-primary-default' : 'text-text-secondary hover:bg-background-subtle hover:text-text-primary'
            }`}
          >
            <Link2Icon className="h-4 w-4" aria-hidden="true" />
          </button>
        </PopoverTrigger>
      </Tooltip>
      <PopoverContent align="start" className="w-72 p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
        >
          <label htmlFor="link-url" className="text-xs font-medium text-text-secondary">
            {ru.toolbar.linkAddress}
          </label>
          <input
            id="link-url"
            autoFocus
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://"
            className="mt-1 h-9 w-full rounded-lg border border-border-default bg-background-surface px-2.5 text-sm text-text-primary focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-primary-100"
          />
          <div className="mt-2 flex justify-end gap-1.5">
            {active && (
              <button
                type="button"
                onClick={() => {
                  editor.unsetLink();
                  setOpen(false);
                }}
                className="h-8 rounded-md px-2.5 text-xs font-medium text-text-secondary hover:bg-background-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
              >
                {ru.toolbar.removeLink}
              </button>
            )}
            <button type="submit" className="h-8 rounded-md bg-primary-default px-3 text-xs font-medium text-background-surface hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-1">
              {ru.toolbar.apply}
            </button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

