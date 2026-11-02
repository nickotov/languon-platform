import React, { useState } from 'react';
import { ArrowDownIcon, ArrowUpIcon, CheckCircle2Icon, ChevronDownIcon, ChevronLeftIcon, ChevronRightIcon, CircleIcon, LibraryBigIcon } from 'lucide-react';
import type { WorkbookSheet } from '../../data/workbook';
import { demoWorkbook } from '../../data/workbook';
import { bs } from '../../data/blockStrings';

interface WorkbookStripProps {
  touch: boolean;
  /** Authors can reorder; readers only navigate. */
  canReorder: boolean;
  /** Reader's explicit completion of the current sheet. */
  currentCompleted?: boolean;
  onNavigate: (title: string) => void;
}

/** Compact workbook context: name, position, previous/next, and a disclosable ordered outline. */
export function WorkbookStrip({ touch, canReorder, currentCompleted, onNavigate }: WorkbookStripProps) {
  const [sheets, setSheets] = useState<WorkbookSheet[]>(demoWorkbook.sheets);
  const [open, setOpen] = useState(false);
  const index = sheets.findIndex((s) => s.id === demoWorkbook.currentId);
  const prev = sheets[index - 1];
  const next = sheets[index + 1];
  const done = sheets.filter((s) => (s.id === demoWorkbook.currentId ? currentCompleted ?? s.completed : s.completed)).length;
  const h = touch ? 'h-11 min-w-11' : 'h-7 min-w-7';
  const icon = `inline-flex items-center justify-center rounded-md text-text-tertiary hover:bg-background-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-30 ${h}`;

  const move = (i: number, dir: -1 | 1) =>
    setSheets((s) => {
      const n = [...s];
      [n[i], n[i + dir]] = [n[i + dir], n[i]];
      return n;
    });

  return (
    <nav aria-label={bs.workbook.label} className="mb-4">
      <div className="flex min-w-0 items-center gap-1 text-xs text-text-tertiary">
        <LibraryBigIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <button
          type="button"
          aria-expanded={open}
          aria-controls="workbook-outline"
          onClick={() => setOpen((o) => !o)}
          className={`inline-flex min-w-0 items-center gap-1 rounded-md px-1 font-medium text-text-secondary hover:bg-background-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${touch ? 'h-11' : 'h-7'}`}
        >
          <span className="truncate">{demoWorkbook.name}</span>
          <ChevronDownIcon className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
          <span className="sr-only">{bs.workbook.outline}</span>
        </button>
        <span aria-hidden="true">·</span>
        <span className="shrink-0">{bs.workbook.position(index + 1, sheets.length)}</span>
        <span className="flex-1" />
        <button type="button" disabled={!prev} onClick={() => prev && onNavigate(prev.title)} aria-label={prev ? `${bs.workbook.prev}: ${prev.title}` : bs.workbook.prev} className={icon}>
          <ChevronLeftIcon className="h-4 w-4" aria-hidden="true" />
        </button>
        <button type="button" disabled={!next} onClick={() => next && onNavigate(next.title)} aria-label={next ? `${bs.workbook.next}: ${next.title}` : bs.workbook.next} className={icon}>
          <ChevronRightIcon className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>

      {open && (
        <div id="workbook-outline" className="mt-1 rounded-xl border border-border-default bg-background-surface p-1.5">
          <p className="px-2 pb-1 pt-0.5 text-xs text-text-tertiary">{bs.workbook.progress(done, sheets.length)}</p>
          <ol>
            {sheets.map((s, i) => {
              const current = s.id === demoWorkbook.currentId;
              const completed = current ? currentCompleted ?? s.completed : s.completed;
              return (
                <li key={s.id} className={`flex items-center gap-2 rounded-lg px-2 ${touch ? 'min-h-11' : 'min-h-8'} ${current ? 'bg-primary-subtle' : ''}`}>
                  {completed ? (
                    <CheckCircle2Icon className="h-3.5 w-3.5 shrink-0 text-success-default" aria-label="Completed" />
                  ) : (
                    <CircleIcon className="h-3.5 w-3.5 shrink-0 text-text-disabled" aria-hidden="true" />
                  )}
                  <span className="w-4 shrink-0 text-xs tabular-nums text-text-tertiary">{i + 1}</span>
                  {current ? (
                    <span aria-current="page" className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
                      {s.title} <span className="text-xs font-normal text-text-tertiary">· {bs.workbook.current}</span>
                    </span>
                  ) : (
                    <button type="button" onClick={() => onNavigate(s.title)} className="min-w-0 flex-1 truncate text-left text-sm text-text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus">
                      {s.title}
                    </button>
                  )}
                  {canReorder && (
                    <span className="flex shrink-0">
                      <button type="button" disabled={i === 0} onClick={() => move(i, -1)} aria-label={bs.workbook.moveUp(s.title)} className={icon}>
                        <ArrowUpIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                      <button type="button" disabled={i === sheets.length - 1} onClick={() => move(i, 1)} aria-label={bs.workbook.moveDown(s.title)} className={icon}>
                        <ArrowDownIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
          {canReorder && <p className="px-2 pb-0.5 pt-1 text-xs text-text-tertiary">{bs.workbook.navNote}</p>}
        </div>
      )}
    </nav>
  );
}

