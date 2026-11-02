import React, { useState } from 'react';
import { DumbbellIcon } from 'lucide-react';
import type { VocabEntry } from '../../../types/blocks';
import { Button } from '../../Button';
import { SidePanel } from '../SidePanel';
import { PlayButton } from '../PlayButton';
import { bs } from '../../../data/blockStrings';

interface PracticePreviewProps {
  mode: 'cards' | 'sentences';
  modeLabel: string;
  entries: VocabEntry[];
  mobile: boolean;
  onClose: () => void;
}

/**
 * Stand-in for launching Languon's existing trainer straight from the block (no dictionary needed).
 * Practice is private and never edits the sheet.
 */
export function PracticePreview({ mode, modeLabel, entries, mobile, onClose }: PracticePreviewProps) {
  const deck = mode === 'sentences' ? entries.filter((e) => e.example && e.exampleTranslation) : entries;
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(false);
  const [again, setAgain] = useState(0);
  const done = i >= deck.length;
  const e = deck[i];
  const size = mobile ? 'default' : 'compact';

  const next = (knew: boolean) => {
    if (!knew) setAgain((n) => n + 1);
    setShown(false);
    setI((n) => n + 1);
  };

  return (
    <SidePanel
      title={bs.practice.title(modeLabel)}
      subtitle={done ? undefined : bs.practice.card(i + 1, deck.length)}
      icon={<DumbbellIcon className="h-4 w-4" aria-hidden="true" />}
      mobile={mobile}
      container={null}
      onRequestClose={onClose}
      footer={
        done ? (
          <div className="flex justify-end gap-2">
            <Button size={size} variant="ghost" onClick={() => { setI(0); setAgain(0); }}>
              {bs.practice.restart}
            </Button>
            <Button size={size} onClick={onClose}>
              {bs.practice.close}
            </Button>
          </div>
        ) : !shown ? (
          <div className="flex justify-end">
            <Button size={size} onClick={() => setShown(true)}>
              {bs.practice.reveal}
            </Button>
          </div>
        ) : (
          <div className="flex justify-end gap-2">
            <Button size={size} variant="secondary" onClick={() => next(false)}>
              {bs.practice.again}
            </Button>
            <Button size={size} onClick={() => next(true)}>
              {bs.practice.know}
            </Button>
          </div>
        )
      }
    >
      <p className="mb-4 text-xs leading-5 text-text-tertiary">{bs.practice.note}</p>
      {done ? (
        <div role="status" className="py-8 text-center">
          <p className="text-base font-semibold text-text-primary">{bs.practice.done(deck.length)}</p>
          {again > 0 && <p className="mt-1 text-sm text-text-secondary">{bs.practice.again}: {again}</p>}
        </div>
      ) : (
        <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-2xl border border-border-default px-6 py-10 text-center" aria-live="polite">
          {mode === 'cards' ? (
            <>
              <div className="flex items-center gap-2">
                <p lang="fr" className="text-2xl font-semibold text-text-primary">
                  {e.term}
                </p>
                <PlayButton id={`practice:${e.id}`} text={e.term} label={`Play “${e.term}”`} size="md" />
              </div>
              {e.ipa && <p className="text-sm text-text-tertiary">{e.ipa}</p>}
              {shown && (
                <p lang="ru" className="text-lg text-text-secondary">
                  {e.translation}
                </p>
              )}
            </>
          ) : (
            <>
              <p className="text-xs font-semibold text-text-tertiary">{bs.practice.sentencePrompt}</p>
              <p lang="ru" className="text-lg text-text-primary">
                {e.exampleTranslation}
              </p>
              {shown && (
                <div className="flex items-center gap-2">
                  <p lang="fr" className="text-lg font-medium text-primary-default">
                    {e.example}
                  </p>
                  <PlayButton id={`practice:${e.id}:ex`} text={e.example ?? ''} label="Play sentence" />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </SidePanel>
  );
}

