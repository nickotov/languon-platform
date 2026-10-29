import React, { useEffect, useRef } from 'react';
import { animate, motion, useMotionValue, useReducedMotion } from 'framer-motion';
import { TutorBody } from './TutorBody';
import { FoldedPill } from './FoldedPill';
import { useTutorContext } from '../../contexts/TutorContext';

interface TutorSheetProps {
  areaHeight: number;
  keyboardInset: number;
  safeBottom: number;
}

/** Mobile: the same tutor as a bottom sheet with collapsed, partial, and full states. */
export function TutorSheet({ areaHeight, keyboardInset, safeBottom }: TutorSheetProps) {
  const { tutor, ui, setSheet, launcherRef } = useTutorContext();
  const panelRef = useRef<HTMLElement>(null);
  const dragRef = useRef<{ startY: number; startH: number; lastY: number; lastT: number; v: number } | null>(null);
  const suppressClick = useRef(false);
  const reduce = useReducedMotion();
  const folded = tutor.state.folded;

  const fullH = areaHeight - 12;
  // ~75dvh: the sheet area sits below the 56px mobile top bar, so measure against the full screen height.
  const partialH = Math.min(fullH - 48, Math.round((areaHeight + 56) * 0.75));
  const keyboardH = Math.max(240, areaHeight - keyboardInset - 12);
  const target = keyboardInset > 0 ? keyboardH : ui.sheet === 'full' ? fullH : partialH;
  const height = useMotionValue(target);
  const spring = reduce ? { duration: 0 } : { type: 'spring' as const, stiffness: 420, damping: 42 };

  useEffect(() => {
    if (dragRef.current) return;
    const controls = animate(height, target, spring);
    return () => controls.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  useEffect(() => {
    panelRef.current?.toggleAttribute('inert', folded);
  }, [folded]);

  const fold = () => {
    setSheet('collapsed');
    window.requestAnimationFrame(() => launcherRef.current?.focus());
  };

  const expand = () => {
    setSheet(ui.sheet === 'collapsed' ? 'partial' : ui.sheet);
    window.requestAnimationFrame(() => panelRef.current?.focus());
  };

  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || (e.target as Element).closest('button:not([data-sheet-handle]), a, input, textarea')) return;
    dragRef.current = { startY: e.clientY, startH: height.get(), lastY: e.clientY, lastT: performance.now(), v: 0 };
    const move = (ev: PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const now = performance.now();
      d.v = (ev.clientY - d.lastY) / Math.max(1, now - d.lastT);
      d.lastY = ev.clientY;
      d.lastT = now;
      height.set(Math.min(fullH, Math.max(120, d.startH - (ev.clientY - d.startY))));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const d = dragRef.current;
      dragRef.current = null;
      if (!d) return;
      const h = height.get();
      if (Math.abs(h - d.startH) < 6) {
        animate(height, target, spring);
        return;
      }
      suppressClick.current = true;
      window.setTimeout(() => {
        suppressClick.current = false;
      }, 0);
      let next: 'collapsed' | 'partial' | 'full';
      if (d.v > 0.7 || h < partialH * 0.6) next = ui.sheet === 'full' && h > partialH * 0.6 ? 'partial' : 'collapsed';
      else if (d.v < -0.7 || h > (partialH + fullH) / 2) next = 'full';
      else next = 'partial';
      if (next === 'collapsed') {
        animate(height, partialH, spring);
        fold();
        return;
      }
      animate(height, next === 'full' ? fullH : partialH, spring);
      setSheet(next);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    if (!panelRef.current?.contains(e.target as Node)) return;
    if (document.querySelector('[role="menu"]') || document.querySelector('[data-radix-popper-content-wrapper]')) return;
    e.preventDefault();
    fold();
  };

  return (
    <>
      <motion.section
        ref={panelRef}
        tabIndex={-1}
        aria-label="Language tutor"
        aria-hidden={folded}
        onKeyDown={onKeyDown}
        style={{ height, bottom: keyboardInset }}
        className={`absolute inset-x-0 z-30 flex flex-col overflow-hidden rounded-t-3xl border border-b-0 border-border-default bg-background-surface shadow-lg focus:outline-none ${
          folded ? 'pointer-events-none invisible' : ''
        }`}
      >
        <div onPointerDown={onPointerDown} className="touch-none">
          <button
            type="button"
            data-sheet-handle
            onClick={() => {
              if (suppressClick.current) return;
              setSheet(ui.sheet === 'full' ? 'partial' : 'full');
            }}
            aria-label={ui.sheet === 'full' ? 'Sheet handle: reduce to partial height' : 'Sheet handle: expand to full height'}
            className="flex h-6 w-full items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-border-focus"
          >
            <span className="h-1 w-10 rounded-full bg-border-strong" aria-hidden="true" />
          </button>
        </div>
        <TutorBody onFold={fold} onHeaderPointerDown={onPointerDown} />
        {keyboardInset === 0 && <div aria-hidden="true" style={{ height: `max(${safeBottom}px, env(safe-area-inset-bottom))` }} className="shrink-0 bg-background-surface" />}
      </motion.section>
      {folded && !ui.selectMode && (
        <FoldedPill
          ref={launcherRef}
          onExpand={expand}
          placement="bottom"
          style={{ bottom: `calc(${safeBottom + 12}px + env(safe-area-inset-bottom))` }}
          className="absolute right-4 z-30"
        />
      )}
    </>
  );
}

