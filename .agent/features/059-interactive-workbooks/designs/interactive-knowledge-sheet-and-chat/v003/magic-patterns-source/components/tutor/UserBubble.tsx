import React from 'react';
import { BookAIcon, ClipboardPasteIcon } from 'lucide-react';
import type { UserMsg } from '../../types/tutor';

export function UserBubble({ msg }: { msg: UserMsg }) {
  return (
    <div className="flex flex-col items-end gap-1.5 pl-10">
      {msg.attachments.length > 0 && (
        <ul className="flex w-full flex-col items-end gap-1.5" aria-label="Attached to this question">
          {msg.attachments.map((a) =>
            a.kind === 'card' ? (
              <li key={a.id} className="inline-flex items-center gap-1.5 rounded-lg border border-border-default bg-background-surface px-2 py-1 text-xs text-text-secondary">
                <BookAIcon className="h-3.5 w-3.5" aria-hidden="true" />
                <span lang="fr" className="font-medium text-text-primary">{a.label}</span>
                <span>· {a.card?.translation}</span>
              </li>
            ) : (
              <li
                key={a.id}
                className={`max-w-full rounded-lg border-l-2 bg-background-subtle px-2.5 py-1.5 text-xs leading-5 text-text-secondary ${a.external ? 'border-dashed border-border-strong' : 'border-primary-200'}`}
              >
                <span dir={a.dir} lang={a.external ? undefined : 'fr'} className="line-clamp-2 italic">
                  {a.external && <ClipboardPasteIcon className="mr-1 inline h-3 w-3" aria-label="Pasted" />}
                  {a.text}
                </span>
              </li>
            ),
          )}
        </ul>
      )}
      {msg.text && (
        <div className="whitespace-pre-wrap rounded-2xl rounded-br-md bg-user-message-bg px-3.5 py-2 text-sm leading-6 text-text-primary">
          {msg.text}
        </div>
      )}
      {msg.draftContent && <span className="text-xs text-text-tertiary">Draft content</span>}
    </div>
  );
}

