import React, { useEffect, useRef, useState } from 'react';
import { TutorBody } from './TutorBody';
import { FoldedPill } from './FoldedPill';
import { useTutorContext } from '../../contexts/TutorContext';
import { FULL_HEIGHT } from '../../types/app';

const GUTTER = 24;
const TOP = 20;
const BOTTOM_GAP = 20;
const MIN_HEIGHT = 340;

interface TutorWidgetProps {
  areaWidth: number;
  areaHeight: number;
}

/** Desktop: non-modal floating surface docked to the upper-left or upper-right of the content area. */
export function TutorWidget({ areaWidth, areaHeight }: TutorWidgetProps) {
  const { tutor, ui, setUi, setDock, canWiden, launcherRef, composerRef } = useTutorContext();
  const panelRef = useRef<HTMLElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  const [dragX, setDragX] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [resizing, setResizing] = useState(false);
  const folded = tutor.state.folded;

  const width = Math.max(300, Math.min(ui.wide && canWiden ? 560 : 420, areaWidth - GUTTER * 2));
  const maxHeight = Math.max(MIN_HEIGHT, areaHeight - TOP - BOTTOM_GAP);
  const defaultHeight = Math.min(ui.wide && canWiden ? 680 : 600, maxHeight);
  const height = ui.widgetHeight === null ? defaultHeight : Math.max(MIN_HEIGHT, Math.min(ui.widgetHeight, maxHeight));

  const setHeight = (h: number) => {
    const clamped = Math.max(MIN_HEIGHT, Math.min(h, maxHeight));
    setUi({ widgetHeight: clamped >= maxHeight ? FULL_HEIGHT : clamped });
  };

  const onResizePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const startY = e.clientY;
    const startH = height;
    setResizing(true);
    const move = (ev: PointerEvent) => setHeight(startH + (ev.clientY - startY));
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setResizing(false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onResizeKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 120 : 40;
    if (e.key === 'ArrowDown') setHeight(height + step);
    else if (e.key === 'ArrowUp') setHeight(height - step);
    else if (e.key === 'End') setHeight(maxHeight);
    else if (e.key === 'Home') setUi({ widgetHeight: null });
    else return;
    e.preventDefault();
  };

  useEffect(() => {
    panelRef.current?.toggleAttribute('inert', folded);
  }, [folded]);

  const fold = () => {
    const active = document.activeElement as HTMLElement | null;
    lastFocus.current = active && panelRef.current?.contains(active) ? active : null;
    tutor.fold();
    window.requestAnimationFrame(() => launcherRef.current?.focus());
  };

  const expand = () => {
    tutor.expand();
    window.requestAnimationFrame(() => {
      const prev = lastFocus.current;
      if (prev && document.contains(prev)) prev.focus();
      else composerRef.current?.focus();
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    const target = e.target as Node;
    if (!panelRef.current?.contains(target)) return;
    if (document.querySelector('[role="menu"]') || document.querySelector('[data-radix-popper-content-wrapper]')) return;
    e.preventDefault();
    fold();
  };

  const onHeaderPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as Element).closest('button, a, input, textarea, [role="menu"]')) return;
    e.preventDefault();
    const startX = e.clientX;
    setDragging(true);
    const move = (ev: PointerEvent) => setDragX(ev.clientX - startX);
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const dx = ev.clientX - startX;
      const baseLeft = ui.dock === 'right' ? areaWidth - GUTTER - width : GUTTER;
      const center = baseLeft + dx + width / 2;
      setDock(center < areaWidth / 2 ? 'left' : 'right');
      setDragX(0);
      setDragging(false);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const side: React.CSSProperties = ui.dock === 'right' ? { right: GUTTER } : { left: GUTTER };

  return (
    <>
      <section
        ref={panelRef}
        aria-label="Language tutor"
        aria-hidden={folded}
        onKeyDown={onKeyDown}
        style={{ ...side, top: TOP, width, height, transform: dragX ? `translateX(${dragX}px)` : undefined }}
        className={`absolute z-30 flex flex-col overflow-hidden rounded-2xl border border-border-default bg-background-surface shadow-lg ${
          dragging || resizing ? 'select-none' : 'transition duration-200 ease-out'
        } ${folded ? 'pointer-events-none invisible opacity-0' : 'opacity-100'}`}
      >
        <TutorBody onFold={fold} onHeaderPointerDown={onHeaderPointerDown} />
        <div
          role="separator"
          aria-orientation="horizontal"
          aria-label="Resize tutor height"
          aria-valuemin={MIN_HEIGHT}
          aria-valuemax={maxHeight}
          aria-valuenow={height}
          aria-valuetext={`${height} pixels tall. Arrow keys to resize, End for full height, Home to reset.`}
          tabIndex={0}
          onPointerDown={onResizePointerDown}
          onDoubleClick={() => setUi({ widgetHeight: ui.widgetHeight === FULL_HEIGHT ? null : FULL_HEIGHT })}
          onKeyDown={onResizeKeyDown}
          title="Drag to resize · double-click for full height"
          className="group absolute inset-x-0 bottom-0 z-10 flex h-2.5 cursor-ns-resize touch-none items-end justify-center pb-0.5 focus-visible:outline-none"
        >
          <span
            aria-hidden="true"
            className={`h-1 w-10 rounded-full transition-colors group-hover:bg-border-strong group-focus-visible:bg-border-focus ${resizing ? 'bg-border-focus' : 'bg-transparent'}`}
          />
        </div>
      </section>
      {folded && <FoldedPill ref={launcherRef} onExpand={expand} placement="top" style={{ ...side, top: TOP }} className="absolute z-30" />}
    </>
  );
}

