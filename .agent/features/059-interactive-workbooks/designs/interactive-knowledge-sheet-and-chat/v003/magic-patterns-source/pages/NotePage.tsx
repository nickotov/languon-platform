import React from 'react';
import { MessageSquareIcon } from 'lucide-react';
import { formatDistanceToNowStrict } from 'date-fns';
import type { KnowledgeNote } from '../types/tutor';
import { Badge } from '../components/Badge';
import { Button } from '../components/Button';
import { RichBlocks } from '../components/tutor/RichBlocks';
import { markdownToBlocks } from '../utils/richText';

interface NotePageProps {
  note?: KnowledgeNote;
  onAsk: () => void;
  compact: boolean;
}

export function NotePage({ note, onAsk, compact }: NotePageProps) {
  if (!note) {
    return <p className="p-10 text-sm text-text-secondary">This note isn’t available.</p>;
  }
  return (
    <article className={`mx-auto w-full max-w-2xl ${compact ? 'px-4 pb-32 pt-5' : 'px-8 pb-24 pt-10'}`}>
      <p className="text-xs font-medium uppercase tracking-wide text-text-tertiary">
        Knowledge · {note.studiedLanguage} explained in {note.explanationLanguage}
      </p>
      <h1 lang="fr" className={`mt-2 font-semibold tracking-tight text-text-primary ${compact ? 'text-2xl' : 'text-3xl'}`}>
        {note.title}
      </h1>
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {note.categories.map((c) => (
          <Badge key={c} size="sm">
            {c}
          </Badge>
        ))}
        <span className="ml-1 text-xs text-text-tertiary">
          {note.lastEdit ?? `Updated ${formatDistanceToNowStrict(note.updatedAt, { addSuffix: true })}`}
        </span>
      </div>
      <div className="mt-5 flex border-y border-border-default py-3">
        <Button variant="secondary" size={compact ? 'default' : 'compact'} leadingIcon={<MessageSquareIcon className="h-4 w-4" />} onClick={onAsk}>
          Ask about this
        </Button>
      </div>
      <p className="mt-6 text-lg leading-8 text-text-primary">{note.summary}</p>
      <div data-source-selectable className="mt-5 text-base leading-7 text-text-primary">
        <RichBlocks blocks={markdownToBlocks(note.body)} />
      </div>
    </article>
  );
}

