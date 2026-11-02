import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { ChevronsDownIcon, ChevronsUpIcon, XIcon } from 'lucide-react';
import { ru } from '../../data/strings';

interface SidePanelProps {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  mobile: boolean;
  /** Container the panel is portalled into (keeps it inside the prototype frame). */
  container: HTMLElement | null;
  onRequestClose: () => void;
  footer: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Focused editing surface: right-side dialog on desktop (the sheet stays visible beside it),
 * bottom sheet on mobile that can expand to full height for the keyboard.
 */
export function SidePanel({ title, subtitle, icon, mobile, container, onRequestClose, footer, children }: SidePanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<Element | null>(typeof document !== 'undefined' ? document.activeElement : null);
  const [full, setFull] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    const el = panelRef.current?.querySelector<HTMLElement>('input, textarea, select, button:not([data-panel-chrome])');
    el?.focus();
    const back = returnFocus.current;
    return () => {
      if (back instanceof HTMLElement && document.contains(back)) back.focus();
    };
  }, []);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onRequestClose();
    }
    if (e.key === 'Tab' && panelRef.current) {
      // Keep keyboard focus inside the focused editor while it's open.
      const f = Array.from(panelRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input, textarea, select, [tabindex="0"]'));
      if (!f.length) return;
      const first = f[0];
      const last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const titleId = 'side-panel-title';
  const motionProps = reduced
    ? {}
    : mobile
      ? { initial: { y: 40, opacity: 0 }, animate: { y: 0, opacity: 1 }, transition: { duration: 0.2, ease: [0, 0, 0.2, 1] } }
      : { initial: { x: 24, opacity: 0 }, animate: { x: 0, opacity: 1 }, transition: { duration: 0.2, ease: [0, 0, 0.2, 1] } };

  const node = (
    <div className="absolute inset-0 z-50" onKeyDown={onKeyDown}>
      <div aria-hidden="true" onClick={onRequestClose} className={`absolute inset-0 ${mobile ? 'bg-overlay' : 'bg-overlay opacity-30'}`} />
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        {...motionProps}
        style={mobile ? (full ? undefined : { maxHeight: '82%' }) : { width: 'min(440px, calc(100% - 24px))' }}
        className={
          mobile
            ? `absolute inset-x-0 bottom-0 flex flex-col rounded-t-2xl border-t border-border-default bg-background-surface shadow-lg ${full ? 'top-2' : ''}`
            : 'absolute bottom-3 right-3 top-3 flex flex-col rounded-2xl border border-border-default bg-background-surface shadow-lg'
        }
      >
        {mobile && <div aria-hidden="true" className="mx-auto mt-2 h-1 w-10 rounded-full bg-border-strong" />}
        <header className="flex shrink-0 items-start gap-2.5 border-b border-border-default px-4 py-3">
          {icon && <span className="mt-0.5 text-text-tertiary">{icon}</span>}
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="truncate text-base font-semibold text-text-primary">
              {title}
            </h2>
            {subtitle && <p className="text-xs text-text-tertiary">{subtitle}</p>}
          </div>
          {mobile && (
            <button
              type="button"
              data-panel-chrome
              onClick={() => setFull((f) => !f)}
              aria-label={full ? ru.editor.collapse : ru.editor.expand}
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg text-text-secondary hover:bg-background-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            >
              {full ? <ChevronsDownIcon className="h-4 w-4" aria-hidden="true" /> : <ChevronsUpIcon className="h-4 w-4" aria-hidden="true" />}
            </button>
          )}
          <button
            type="button"
            data-panel-chrome
            onClick={onRequestClose}
            aria-label={ru.editor.close}
            className={`inline-flex items-center justify-center rounded-lg text-text-secondary hover:bg-background-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${mobile ? 'h-11 w-11' : 'h-8 w-8'}`}
          >
            <XIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
        <footer className="shrink-0 border-t border-border-default px-4 py-3" style={{ paddingBottom: mobile ? 'max(12px, env(safe-area-inset-bottom))' : undefined }}>
          {footer}
        </footer>
      </motion.div>
    </div>
  );

  return container ? createPortal(node, container) : node;
}

