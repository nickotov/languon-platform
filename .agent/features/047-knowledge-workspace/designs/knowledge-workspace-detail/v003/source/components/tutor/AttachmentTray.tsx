import React, { useState } from 'react';
import { BookAIcon, ClipboardPasteIcon, FileTextIcon, QuoteIcon, XIcon } from 'lucide-react';
import type { Attachment } from '../../types/tutor';
import { ATTACHMENT_LIMIT } from '../../utils/tutorReducer';
import { useTutorContext } from '../../contexts/TutorContext';

const icons = {
  quote: QuoteIcon,
  passage: FileTextIcon,
  card: BookAIcon,
  pasted: ClipboardPasteIcon,
};

export function AttachmentTray({ attachments }: { attachments: Attachment[] }) {
  const { tutor, platform, composerRef } = useTutorContext();
  const [expanded, setExpanded] = useState<string | null>(null);
  const touch = platform === 'mobile';
  if (attachments.length === 0) return null;
  const open = attachments.find((a) => a.id === expanded);

  return (
    <div className="mb-2">
      <ul className="flex flex-wrap gap-1.5" aria-label="Attached material">
        {attachments.map((a) => {
          const Icon = icons[a.kind];
          const isOpen = expanded === a.id;
          return (
            <li
              key={a.id}
              className={`inline-flex max-w-full items-center rounded-lg border bg-background-surface text-xs ${a.external ? 'border-dashed border-border-strong' : 'border-border-default'} ${isOpen ? 'ring-2 ring-primary-100' : ''}`}
            >
              <button
                type="button"
                aria-expanded={isOpen}
                aria-label={`${a.kind === 'pasted' ? 'Pasted text' : a.kind === 'card' ? 'Dictionary card' : 'Quote'}: ${a.label}. Show details`}
                onClick={() => setExpanded(isOpen ? null : a.id)}
                className={`flex min-w-0 items-center gap-1.5 rounded-l-lg pl-2 pr-1 text-text-primary hover:bg-background-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${touch ? 'h-11' : 'h-8'}`}
              >
                <Icon className="h-3.5 w-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
                <span lang={a.external ? undefined : 'fr'} dir={a.dir} className="max-w-40 truncate">
                  {a.label}
                </span>
                {a.external && <span className="rounded bg-background-subtle px-1 text-text-tertiary">Pasted</span>}
              </button>
              <button
                type="button"
                aria-label={`Remove ${a.label}`}
                onClick={() => {
                  tutor.removeAttachment(a.id);
                  if (isOpen) setExpanded(null);
                  composerRef.current?.focus();
                }}
                className={`flex items-center justify-center rounded-r-lg text-text-tertiary hover:bg-background-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${touch ? 'h-11 w-10' : 'h-8 w-7'}`}
              >
                <XIcon className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </li>
          );
        })}
      </ul>
      {open && <AttachmentPreview attachment={open} />}
      {attachments.length >= ATTACHMENT_LIMIT && (
        <p className="mt-1.5 text-xs text-text-tertiary">Limit of {ATTACHMENT_LIMIT} attachments reached. Remove one to add another.</p>
      )}
    </div>
  );
}

function AttachmentPreview({ attachment: a }: { attachment: Attachment }) {
  return (
    <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-border-default bg-background-subtle p-3 text-sm">
      {a.card ? (
        <div>
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span lang="fr" className="text-base font-semibold text-text-primary">{a.card.word}</span>
            <span className="text-xs text-text-tertiary">{a.card.transcription}</span>
            <span className="text-xs text-text-tertiary">· {a.card.partOfSpeech}</span>
          </div>
          <p className="mt-0.5 font-medium text-text-primary">{a.card.translation}</p>
          <p className="mt-1 leading-6 text-text-secondary">{a.card.definition}</p>
          <ul className="mt-2 space-y-1.5">
            {a.card.examples.map((ex) => (
              <li key={ex.source} className="border-l-2 border-primary-200 pl-2.5">
                <p lang="fr" className="text-text-primary">{ex.source}</p>
                <p className="text-xs text-text-secondary">{ex.translation}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div>
          <p dir={a.dir} lang={a.external ? undefined : 'fr'} className="whitespace-pre-wrap leading-6 text-text-primary">
            {a.text}
          </p>
          {a.translation && <p className="mt-1.5 text-xs leading-5 text-text-secondary">{a.translation}</p>}
          {a.truncated && (
            <p className="mt-2 text-xs text-warning-default">
              Shortened to the first 1,200 of {a.originalLength?.toLocaleString('en-US')} characters.
            </p>
          )}
        </div>
      )}
      <p className="mt-2 border-t border-border-default pt-2 text-xs text-text-tertiary">
        {a.external ? 'Pasted copy from another source — not part of the current page.' : `From ${a.origin}`}
      </p>
    </div>
  );
}

