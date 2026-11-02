import React from 'react';
import { CornerDownRightIcon } from 'lucide-react';
import type { SourceInfo } from '../../types/tutor';
import { useTutorContext } from '../../contexts/TutorContext';

const suggestions: Record<SourceInfo['kind'], string[]> = {
  text: ['Why is the subjunctive used here?', 'Explain the tone of this passage.', 'Compare « pourtant » and « quand même » in this text.'],
  dictionary: ['Compare these two expressions.', 'Which of these sounds most formal?', 'Give me everyday examples for « quand même ».'],
  note: ['Is there a common mistake I should add?', 'Explain this rule more simply.', 'Compare these two expressions.'],
};

const intro: Record<SourceInfo['kind'], string> = {
  text: 'The tutor can read this text and its English translation. Select a passage on the page, or start with:',
  dictionary: 'The tutor knows this dictionary and can look up its cards. Attach a few cards to compare, or start with:',
  note: 'The tutor can read this note. Ask a question, or start with:',
};

export function EmptyState({ source }: { source: SourceInfo }) {
  const { tutor, composerRef, platform } = useTutorContext();
  const fill = (text: string) => {
    tutor.setComposer({ text });
    window.requestAnimationFrame(() => {
      const el = composerRef.current;
      if (el) {
        el.focus();
        el.setSelectionRange(text.length, text.length);
      }
    });
  };
  return (
    <div className="px-1 py-2">
      <h3 className="text-sm font-semibold text-text-primary">Ask about “{source.title}”</h3>
      <p className="mt-1 text-sm leading-6 text-text-secondary">{intro[source.kind]}</p>
      <ul className="mt-3 space-y-1.5">
        {suggestions[source.kind].map((s) => (
          <li key={s}>
            <button
              type="button"
              onClick={() => fill(s)}
              className={`flex w-full items-center gap-2 rounded-xl border border-border-default bg-background-surface px-3 text-left text-sm text-text-primary transition-colors hover:border-border-strong hover:bg-background-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${platform === 'mobile' ? 'min-h-11 py-2.5' : 'py-2'}`}
            >
              <CornerDownRightIcon className="h-3.5 w-3.5 shrink-0 text-text-tertiary" aria-hidden="true" />
              {s}
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-text-tertiary">Suggestions fill in the question box — nothing is sent until you press Send.</p>
    </div>
  );
}

