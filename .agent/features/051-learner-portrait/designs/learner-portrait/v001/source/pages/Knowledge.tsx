import React, { useState } from 'react';
import { FileTextIcon, PlusIcon } from 'lucide-react';
import { Button } from '../components/Button';
import { knowledgeDocs } from '../data/library';

export function Knowledge() {
  const [docs, setDocs] = useState(knowledgeDocs);
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-6 sm:px-6 sm:py-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-text-primary">Knowledge</h1>
          <p className="mt-1 text-sm text-text-secondary">Your library. Start a document to discuss any language topic with AI chat.</p>
        </div>
        <Button
          leadingIcon={<PlusIcon className="h-4 w-4" />}
          onClick={() => setDocs((d) => [{ title: `Untitled document ${d.length - knowledgeDocs.length + 1}`, meta: 'New · AI chat ready' }, ...d])}
        >
          New document
        </Button>
      </div>
      <ul className="mt-6 space-y-3">
        {docs.map((d) => (
          <li key={d.title} className="flex items-center gap-3 rounded-2xl border border-border-default bg-background-surface p-4">
            <FileTextIcon className="h-5 w-5 text-text-tertiary" aria-hidden="true" />
            <div>
              <p className="font-medium text-text-primary">{d.title}</p>
              <p className="text-sm text-text-secondary">{d.meta}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

