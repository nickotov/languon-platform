import React, { useState } from 'react';
import { CheckIcon, LightbulbIcon, PencilIcon, XIcon } from 'lucide-react';
import { Button } from '../Button';
import { Textarea } from '../Textarea';
import { TOPIC_LABELS } from '../../data/interviewCopy';
import { LIMITS } from '../../data/portraitOptions';
import { usePrototype } from '../../contexts/PrototypeContext';
import type { Proposal } from '../../types/portrait';
import { uid, validateShortText } from '../../utils/text';
import { CharCounter } from './editor/CharCounter';

export function ProposalCard({ proposal }: { proposal: Proposal }) {
  const { setInterview } = usePrototype();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(proposal.text);
  const counterId = React.useId();
  const error = validateShortText(text, LIMITS.customAnswer, true);

  const accept = () => {
    if (error) {
      setEditing(true);
      return;
    }
    setInterview((iv) =>
      iv
        ? {
            ...iv,
            draft: { ...iv.draft, notes: [...iv.draft.notes, { id: uid('note'), topic: proposal.topic, text: text.trim() }] },
            proposals: iv.proposals.filter((p) => p.id !== proposal.id),
          }
        : iv,
    );
  };
  const dismiss = () => setInterview((iv) => (iv ? { ...iv, proposals: iv.proposals.filter((p) => p.id !== proposal.id) } : iv));
  const saveEdit = () => {
    if (error) return;
    setInterview((iv) => (iv ? { ...iv, proposals: iv.proposals.map((p) => (p.id === proposal.id ? { ...p, text: text.trim(), shortened: false } : p)) } : iv));
    setEditing(false);
  };

  return (
    <article aria-label="Proposed portrait note" className="rounded-xl border border-dashed border-primary-default bg-background-surface p-4">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-medium text-primary-default">
        <LightbulbIcon className="h-4 w-4" aria-hidden="true" />
        <span>Proposed for your draft · {TOPIC_LABELS[proposal.topic]}</span>
        <span className="rounded-md bg-background-subtle px-2 py-0.5 text-text-secondary">Not saved yet</span>
      </div>
      {editing ? (
        <div className="space-y-1">
          <Textarea label="Edit proposed note" value={text} rows={3} error={error} aria-describedby={counterId} onChange={(e) => setText(e.target.value)} />
          <CharCounter id={counterId} value={text} max={LIMITS.customAnswer} />
          <div className="flex flex-wrap gap-2 pt-2">
            <Button size="compact" onClick={saveEdit} disabled={Boolean(error)}>
              Done
            </Button>
            <Button
              size="compact"
              variant="ghost"
              onClick={() => {
                setText(proposal.text);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : (
        <>
          <p className="break-words text-base text-text-primary">{proposal.text}</p>
          {proposal.shortened && <p className="mt-1 text-xs text-warning-default">Shortened by the interviewer. Edit it if something’s missing.</p>}
          <p className="mt-2 break-words text-xs text-text-tertiary">From your message: “{proposal.sourceQuote}”</p>
          {error && <p className="mt-2 text-sm text-danger-default">{error}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="compact" leadingIcon={<CheckIcon className="h-4 w-4" />} onClick={accept}>
              Add to draft
            </Button>
            <Button size="compact" variant="secondary" leadingIcon={<PencilIcon className="h-4 w-4" />} onClick={() => setEditing(true)}>
              Edit
            </Button>
            <Button size="compact" variant="ghost" leadingIcon={<XIcon className="h-4 w-4" />} onClick={dismiss}>
              Dismiss
            </Button>
          </div>
        </>
      )}
    </article>
  );
}

