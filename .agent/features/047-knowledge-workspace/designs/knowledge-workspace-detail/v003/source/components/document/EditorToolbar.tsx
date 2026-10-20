import React, { useState } from 'react';
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
import type { BlockTag, RichEditor } from '../../utils/richEditor';

interface EditorToolbarProps {
  editor: RichEditor;
  density: 'full' | 'compact' | 'touch';
}

const mod = typeof navigator !== 'undefined' && /Mac/.test(navigator.platform) ? '⌘' : 'Ctrl+';
const blockLabels: Record<BlockTag, string> = { P: 'Paragraph', H1: 'Heading 1', H2: 'Heading 2', H3: 'Heading 3' };

interface ToolProps {
  label: string;
  icon: React.ReactNode;
  active?: boolean;
  disabled?: boolean;
  shortcut?: string;
  onClick: () => void;
  btn: string;
}

function Tool({ label, icon, active, disabled, onClick, shortcut, btn }: ToolProps) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      title={shortcut ? `${label} (${shortcut})` : label}
      disabled={disabled}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`inline-flex shrink-0 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-40 ${btn} ${
        active ? 'bg-primary-subtle text-primary-default' : 'text-text-secondary hover:bg-background-subtle hover:text-text-primary'
      }`}
    >
      {icon}
    </button>
  );
}

export function EditorToolbar({ editor, density }: EditorToolbarProps) {
  const touch = density === 'touch';
  const btn = touch ? 'h-11 w-11' : 'h-8 w-8';
  const ic = 'h-4 w-4';
  const blockTag = editor.blockTag();

  const marks = (
    <>
      <Tool btn={btn} label="Bold" shortcut={`${mod}B`} icon={<BoldIcon className={ic} />} active={editor.isActive('bold')} onClick={() => editor.toggleMark('bold')} />
      <Tool btn={btn} label="Italic" shortcut={`${mod}I`} icon={<ItalicIcon className={ic} />} active={editor.isActive('italic')} onClick={() => editor.toggleMark('italic')} />
    </>
  );
  const extraMarks = (
    <>
      <Tool btn={btn} label="Underline" shortcut={`${mod}U`} icon={<UnderlineIcon className={ic} />} active={editor.isActive('underline')} onClick={() => editor.toggleMark('underline')} />
      <Tool btn={btn} label="Strikethrough" icon={<StrikethroughIcon className={ic} />} active={editor.isActive('strikeThrough')} onClick={() => editor.toggleMark('strikeThrough')} />
    </>
  );
  const blocks = (
    <>
      <Tool btn={btn} label="Bulleted list" icon={<ListIcon className={ic} />} active={editor.isActive('insertUnorderedList')} onClick={() => editor.toggleList('ul')} />
      <Tool btn={btn} label="Numbered list" icon={<ListOrderedIcon className={ic} />} active={editor.isActive('insertOrderedList')} onClick={() => editor.toggleList('ol')} />
      <Tool btn={btn} label="Quote" icon={<QuoteIcon className={ic} />} active={editor.isActive('blockquote')} onClick={() => editor.toggleQuote()} />
    </>
  );
  const inserts = (
    <>
      <LinkTool editor={editor} btn={btn} />
      <Tool btn={btn} label="Insert table" icon={<TableIcon className={ic} />} active={editor.isActive('table')} disabled={editor.isActive('table')} onClick={() => editor.insertTable()} />
    </>
  );
  const history = (
    <>
      <Tool btn={btn} label="Undo" shortcut={`${mod}Z`} icon={<Undo2Icon className={ic} />} onClick={() => editor.undo()} />
      <Tool btn={btn} label="Redo" shortcut={`${mod}⇧Z`} icon={<Redo2Icon className={ic} />} onClick={() => editor.redo()} />
    </>
  );
  const sep = <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-border-default" />;

  return (
    <div role="toolbar" aria-label="Formatting" className={`flex items-center gap-0.5 ${touch ? 'overflow-x-auto px-2 py-1' : ''}`}>
      <DropdownMenu
        menuClassName="w-48"
        trigger={
          <DropdownMenuTrigger
            hideChevron
            aria-label={`Text style: ${blockLabels[blockTag]}`}
            className={`inline-flex shrink-0 items-center gap-1 rounded-md !border-0 !bg-transparent !shadow-none px-2 text-sm font-medium text-text-primary hover:!bg-background-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${touch ? '!h-11' : '!h-8'}`}
          >
            <span className="w-20 text-left">{blockLabels[blockTag]}</span>
            <ChevronDownIcon className="h-3.5 w-3.5 text-text-tertiary" aria-hidden="true" />
          </DropdownMenuTrigger>
        }
      >
        <DropdownMenuItem onSelect={() => editor.setBlock('P')}>Paragraph</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => editor.setBlock('H1')}>
          <span className="text-lg font-semibold">Heading 1</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => editor.setBlock('H2')}>
          <span className="text-base font-semibold">Heading 2</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => editor.setBlock('H3')}>
          <span className="text-sm font-semibold">Heading 3</span>
        </DropdownMenuItem>
      </DropdownMenu>
      {sep}
      {marks}
      {density !== 'compact' && extraMarks}
      {sep}
      {blocks}
      {density !== 'compact' && (
        <>
          {sep}
          {inserts}
        </>
      )}
      {sep}
      {history}
      {density === 'compact' && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label="More formatting"
              onMouseDown={(e) => e.preventDefault()}
              className={`inline-flex shrink-0 items-center justify-center rounded-md text-text-secondary hover:bg-background-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${btn}`}
            >
              <EllipsisIcon className={ic} aria-hidden="true" />
            </button>
          </PopoverTrigger>
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

  const apply = () => {
    const href = url.trim();
    if (!href) editor.unsetLink();
    else editor.setLink(/^https?:\/\//.test(href) ? href : `https://${href}`);
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setUrl(editor.linkHref());
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={active ? 'Edit link' : 'Add link'}
          aria-pressed={active}
          disabled={disabled}
          title={disabled ? 'Select text to add a link' : 'Link'}
          onMouseDown={(e) => e.preventDefault()}
          className={`inline-flex shrink-0 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-40 ${btn} ${
            active ? 'bg-primary-subtle text-primary-default' : 'text-text-secondary hover:bg-background-subtle hover:text-text-primary'
          }`}
        >
          <Link2Icon className="h-4 w-4" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            apply();
          }}
        >
          <label htmlFor="link-url" className="text-xs font-medium text-text-secondary">
            Link address
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
                className="h-8 rounded-md px-2.5 text-xs font-medium text-text-secondary hover:bg-background-subtle"
              >
                Remove link
              </button>
            )}
            <button type="submit" className="h-8 rounded-md bg-primary-default px-3 text-xs font-medium text-background-surface hover:bg-primary-hover">
              Apply
            </button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

