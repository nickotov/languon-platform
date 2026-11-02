import React from 'react';
import { ArrowDownIcon, ArrowUpIcon, CopyIcon, CopyPlusIcon, EllipsisIcon, PencilIcon, Trash2Icon } from 'lucide-react';
import { DropdownMenu, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '../DropdownMenu';
import { ru } from '../../data/strings';

export interface BlockExtraAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  onSelect: () => void;
  disabled?: boolean;
}

interface BlockMenuProps {
  title: string;
  touch: boolean;
  isFirst: boolean;
  isLast: boolean;
  /** Type-specific actions slot into the same menu instead of a separate pattern per family. */
  extra?: BlockExtraAction[];
  /** Media blocks open a copy flow instead of copying to the clipboard. */
  copyLabel?: string;
  onEdit: () => void;
  onCopy: () => void;
  onDuplicate: () => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
}

export function BlockMenu(p: BlockMenuProps) {
  const icon = 'h-4 w-4';
  return (
    <DropdownMenu
      align="end"
      menuClassName="w-56"
      trigger={
        <DropdownMenuTrigger
          hideChevron
          aria-label={ru.blocks.menu(p.title)}
          className={`inline-flex items-center justify-center rounded-lg !border-0 !bg-transparent !p-0 !shadow-none text-text-tertiary hover:!bg-background-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${p.touch ? '!h-11 !w-11' : '!h-8 !w-8'}`}
        >
          <EllipsisIcon className="h-4 w-4" aria-hidden="true" />
        </DropdownMenuTrigger>
      }
    >
      <DropdownMenuItem icon={<PencilIcon className={icon} />} onSelect={p.onEdit}>
        {ru.blocks.edit}
      </DropdownMenuItem>
      <DropdownMenuItem icon={<CopyIcon className={icon} />} onSelect={p.onCopy}>
        {p.copyLabel ?? ru.blocks.copy}
      </DropdownMenuItem>
      <DropdownMenuItem icon={<CopyPlusIcon className={icon} />} onSelect={p.onDuplicate}>
        {ru.blocks.duplicate}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem icon={<ArrowUpIcon className={icon} />} disabled={p.isFirst} onSelect={() => p.onMove(-1)}>
        {p.isFirst ? `${ru.blocks.moveUp} · ${ru.blocks.atTop}` : ru.blocks.moveUp}
      </DropdownMenuItem>
      <DropdownMenuItem icon={<ArrowDownIcon className={icon} />} disabled={p.isLast} onSelect={() => p.onMove(1)}>
        {p.isLast ? `${ru.blocks.moveDown} · ${ru.blocks.atBottom}` : ru.blocks.moveDown}
      </DropdownMenuItem>
      {p.extra && p.extra.length > 0 && (
        <>
          <DropdownMenuSeparator />
          {p.extra.map((a) => (
            <DropdownMenuItem key={a.id} icon={a.icon} disabled={a.disabled} onSelect={a.onSelect}>
              {a.label}
            </DropdownMenuItem>
          ))}
        </>
      )}
      <DropdownMenuSeparator />
      <DropdownMenuItem destructive icon={<Trash2Icon className={icon} />} onSelect={p.onDelete}>
        {ru.blocks.delete}
      </DropdownMenuItem>
    </DropdownMenu>
  );
}

