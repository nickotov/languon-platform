import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDownIcon, ShieldCheckIcon } from 'lucide-react';

const POINTS = [
  'The interviewer uses this interview, your manual edits, and any portrait you’ve already approved.',
  'It doesn’t look at your other chats, documents, or learning activity.',
  'You review and save everything it proposes. Nothing is saved automatically.',
  'Saving your portrait and using it in chats are separate choices.',
  'Your portrait describes practical learning preferences. It doesn’t keep diagnostic labels.',
  'The interview transcript and working draft are removed when you approve or discard them, or after 14 days without activity.',
  'Turning off or deleting your portrait doesn’t erase anything already in your ordinary chat history.',
  'Editing by hand, reviewing, and saving never need an AI response.',
];

export function DataUseDetails({ defaultOpen = false }: { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = React.useId();
  return (
    <div className="rounded-2xl border border-border-default bg-background-surface">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className="flex min-h-11 w-full items-center gap-3 rounded-2xl px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
      >
        <ShieldCheckIcon className="h-5 w-5 shrink-0 text-primary-default" aria-hidden="true" />
        <span className="flex-1 font-medium text-text-primary">How your information is used</span>
        <ChevronDownIcon className={`h-5 w-5 text-text-tertiary transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            id={id}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <ul className="space-y-2 px-4 pb-4 pl-12 text-sm leading-relaxed text-text-secondary">
              {POINTS.map((p) => (
                <li key={p} className="list-disc">
                  {p}
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

