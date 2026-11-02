import React, { forwardRef } from 'react';
import { GripVerticalIcon } from 'lucide-react';
import type { SheetBlock } from '../../types/blocks';
import { blockCountLabel, blockIcons } from './BlockView';
import { ru } from '../../data/strings';

interface BlockFrameProps {
  block: SheetBlock;
  /** Learner view: no grip, no menu. */
  authoring: boolean;
  touch: boolean;
  selected: boolean;
  flashing: boolean;
  dragging: boolean;
  menu?: React.ReactNode;
  /** Study-only actions (train, show all) for learner views; never authoring actions. */
  learnerMenu?: React.ReactNode;
  /** Sheet setting: wrap the block in a softly tinted container that marks its family. */
  accent?: boolean;
  onSelect: () => void;
  onDeselect: () => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  onUndo: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  children: React.ReactNode;
}

/**
 * Shared authoring chrome: grip · icon · heading · count · ellipsis, on one row.
 * Block content sits outside the prose editor, so the prose toolbar never targets it.
 */
export const BlockFrame = forwardRef<HTMLElement, BlockFrameProps>(function BlockFrame(p, ref) {
  const Icon = blockIcons[p.block.type];
  const typeLabel = ru.blocks.types[p.block.type];

  const onKeyDown = (e: React.KeyboardEvent) => {
    // Only when the block itself (not a field inside it) has focus.
    if (e.target !== e.currentTarget || !p.authoring) return;
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      p.onMove(e.key === 'ArrowUp' ? -1 : 1);
    } else if (e.key === 'Escape') p.onDeselect();
    else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      p.onDelete();
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      p.onUndo();
    }
  };

  return (
    <section
      ref={ref}
      tabIndex={p.authoring ? -1 : undefined}
      aria-label={ru.blocks.regionLabel(typeLabel, p.block.title)}
      aria-selected={p.authoring ? p.selected : undefined}
      onKeyDown={onKeyDown}
      data-block-id={p.block.id}
      className={`group/block relative rounded-xl border transition-colors duration-500 focus:outline-none ${
        p.accent ? `block-accent block-accent-${p.block.type} -mx-3 px-4 pb-4 pt-2 sm:-mx-4` : 'border-transparent -mx-3 px-3 pb-2 pt-1'
      } ${p.selected ? 'ring-2 ring-primary-default' : p.flashing && p.accent ? 'ring-2 ring-primary-200' : 'ring-1 ring-transparent'} ${
        p.flashing && !p.accent ? 'bg-primary-subtle' : ''
      } ${p.dragging ? 'opacity-40' : ''}`}
    >
      <header className={`flex items-center gap-1.5 ${p.touch ? 'min-h-11' : 'min-h-9'}`}>
        {p.authoring && (
          <button
            type="button"
            draggable={!p.touch}
            onDragStart={p.onDragStart}
            onDragEnd={p.onDragEnd}
            onClick={p.onSelect}
            aria-label={ru.blocks.grip(p.block.title)}
            aria-pressed={p.selected}
            className={`inline-flex shrink-0 cursor-grab items-center justify-center rounded-md text-text-tertiary transition-opacity hover:bg-background-subtle hover:text-text-primary focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus active:cursor-grabbing ${
              p.touch ? 'h-11 w-8' : '-ml-7 h-7 w-5'
            } ${p.selected || p.touch ? 'opacity-100' : 'opacity-0 group-hover/block:opacity-100'}`}
          >
            <GripVerticalIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
        <Icon className="h-4 w-4 shrink-0 text-text-tertiary" aria-hidden="true" />
        <h3 className="min-w-0 truncate text-sm font-semibold text-text-primary">{p.block.title}</h3>
        <span className="shrink-0 text-xs text-text-tertiary">
          {typeLabel} · {blockCountLabel(p.block)}
        </span>
        <span className="flex-1" />
        {p.authoring ? p.menu : p.learnerMenu}
      </header>
      <div className="mt-0.5">{p.children}</div>
    </section>
  );
});

