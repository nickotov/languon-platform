import React, { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRightIcon, XIcon } from 'lucide-react';
import { Button } from '../Button';
import { IconButton } from '../IconButton';
import { SummaryPanel } from '../portrait/SummaryPanel';
import type { Interview } from '../../types/portrait';
import { countItems } from '../../utils/portraitItems';
import { expiryDate } from '../../utils/dates';

interface DraftPreviewProps {
  interview: Interview;
  onReview: () => void;
  onClose: () => void;
}

function PreviewContent({ interview, onReview, onClose, closeRef }: DraftPreviewProps & { closeRef?: React.Ref<HTMLButtonElement> }) {
  const count = countItems(interview.draft);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">Draft preview</p>
          <span className="rounded-md bg-background-subtle px-2 py-0.5 text-xs text-text-secondary">Not saved</span>
        </div>
        <IconButton ref={closeRef} icon={<XIcon />} label="Hide draft preview" variant="ghost" size="sm" showTooltip={false} onClick={onClose} />
      </div>
      <SummaryPanel items={interview.draft} language={interview.language} title="Your portrait so far" compact headingLevel="h2" />
      <dl className="grid grid-cols-2 gap-2 text-sm">
        <div className="rounded-xl bg-background-subtle p-3">
          <dt className="text-xs text-text-secondary">Items in draft</dt>
          <dd className="text-lg font-semibold text-text-primary">{count}</dd>
        </div>
        <div className="rounded-xl bg-background-subtle p-3">
          <dt className="text-xs text-text-secondary">Awaiting your review</dt>
          <dd className="text-lg font-semibold text-text-primary">{interview.proposals.length}</dd>
        </div>
      </dl>
      <Button fullWidth onClick={onReview} trailingIcon={<ArrowRightIcon className="h-4 w-4" />}>
        Review portrait
      </Button>
      <p className="text-xs text-text-tertiary">Paused interviews resume on any device until {expiryDate(interview.lastActivityAt)}.</p>
    </div>
  );
}

/** Desktop: animated side panel beside the conversation. */
export function DraftPreviewPanel({ open, ...props }: DraftPreviewProps & { open: boolean }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.aside
          key="draft-panel"
          aria-label="Draft preview"
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
          className="sticky top-20 w-80 shrink-0 self-start rounded-2xl border border-border-default bg-background-surface p-5 xl:w-96"
        >
          <PreviewContent {...props} />
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

/** Mobile/tablet: bottom sheet with overlay, Escape and focus handling. */
export function DraftPreviewSheet({ open, ...props }: DraftPreviewProps & { open: boolean }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(props.onClose);
  onCloseRef.current = props.onClose;
  useEffect(() => {
    if (!open) return undefined;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCloseRef.current();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-40 flex flex-col justify-end pt-16" role="dialog" aria-modal="true" aria-label="Draft preview">
          <motion.div
            className="absolute inset-0 bg-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={props.onClose}
          />
          <motion.div
            className="relative max-h-full overflow-y-auto rounded-t-2xl border-t border-border-default bg-background-surface px-4 pb-6 pt-2 shadow-lg"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ duration: 0.25, ease: [0, 0, 0.2, 1] }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 100 || info.velocity.y > 500) props.onClose();
            }}
          >
            <div aria-hidden="true" className="mx-auto mb-3 h-1 w-10 rounded-full bg-border-strong" />
            <PreviewContent {...props} closeRef={closeRef} />
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

