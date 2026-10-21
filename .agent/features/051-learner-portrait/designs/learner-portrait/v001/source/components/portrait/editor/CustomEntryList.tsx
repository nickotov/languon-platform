import React, { useState } from 'react';
import { PlusIcon, XIcon } from 'lucide-react';
import { Button } from '../../Button';
import { validateShortText } from '../../../utils/text';
import { LIMITS } from '../../../data/portraitOptions';
import { ShortTextInput } from './ShortTextInput';

interface CustomEntryListProps {
  label: string;
  entries: string[];
  onChange: (entries: string[]) => void;
  placeholder?: string;
  max: number;
  totalCount: number;
  noun: string;
  checkDiagnostic?: boolean;
}

export function CustomEntryList({ label, entries, onChange, placeholder, max, totalCount, noun, checkDiagnostic }: CustomEntryListProps) {
  const [draft, setDraft] = useState('');
  const [touched, setTouched] = useState(false);
  const atLimit = totalCount >= max;
  const error = draft ? validateShortText(draft, LIMITS.customAnswer, checkDiagnostic) : undefined;
  const duplicate = entries.some((e) => e.toLowerCase() === draft.trim().toLowerCase());

  const add = () => {
    setTouched(true);
    if (!draft.trim() || error || atLimit || duplicate) return;
    onChange([...entries, draft.trim()]);
    setDraft('');
    setTouched(false);
  };

  return (
    <div className="space-y-2">
      {entries.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={`Your ${noun}`}>
          {entries.map((entry) => (
            <li
              key={entry}
              className="inline-flex min-h-11 max-w-full items-center gap-1 rounded-full border border-primary-default bg-primary-subtle py-1 pl-4 pr-1 text-sm text-primary-default"
            >
              <span className="break-words">{entry}</span>
              <button
                type="button"
                onClick={() => onChange(entries.filter((e) => e !== entry))}
                aria-label={`Remove “${entry}”`}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full outline-none hover:bg-background-surface focus-visible:ring-2 focus-visible:ring-border-focus"
              >
                <XIcon className="h-4 w-4" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <ShortTextInput
            label={label}
            value={draft}
            onChange={setDraft}
            placeholder={placeholder}
            checkDiagnostic={checkDiagnostic}
            onEnter={add}
            externalError={
              atLimit && draft
                ? `You’ve reached ${max} ${noun}. Remove one to add another.`
                : touched && duplicate
                  ? 'That’s already in your list.'
                  : undefined
            }
          />
        </div>
        <Button
          variant="secondary"
          className="sm:mt-6"
          leadingIcon={<PlusIcon className="h-4 w-4" />}
          onClick={add}
          disabled={!draft.trim() || Boolean(error) || atLimit}
        >
          Add
        </Button>
      </div>
      {atLimit && !draft && (
        <p className="text-sm text-text-secondary">
          You’ve reached {max} {noun}. Remove one to add another.
        </p>
      )}
    </div>
  );
}

