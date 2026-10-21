import React, { useState } from 'react';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { Button } from '../../Button';
import { Checkbox } from '../../Checkbox';
import { IconButton } from '../../IconButton';
import { Input } from '../../Input';
import { Select } from '../../Select';
import { LEVELS, LIMITS, SUGGESTED_LANGUAGES } from '../../../data/portraitOptions';
import type { LanguageEntry, Level } from '../../../types/portrait';
import { capitalize, countChars, uid } from '../../../utils/text';
import { ChoiceChip } from './ChoiceChip';
import { ShortTextInput } from './ShortTextInput';

interface LanguagesEditorProps {
  languages: LanguageEntry[];
  onChange: (languages: LanguageEntry[]) => void;
}

export function LanguagesEditor({ languages, onChange }: LanguagesEditorProps) {
  const [custom, setCustom] = useState('');
  const atLimit = languages.length >= LIMITS.languages;
  const names = languages.map((l) => l.name.toLowerCase());
  const suggestions = SUGGESTED_LANGUAGES.filter((s) => !names.includes(s.toLowerCase()));
  const customError =
    custom && countChars(custom) > 40
      ? 'Language names can be up to 40 characters.'
      : custom && names.includes(custom.trim().toLowerCase())
        ? 'That language is already listed.'
        : undefined;

  const add = (name: string) => {
    if (atLimit || !name.trim()) return;
    onChange([...languages, { id: uid('lang'), name: capitalize(name.trim()), level: null, learning: false, note: '' }]);
  };
  const update = (id: string, patch: Partial<LanguageEntry>) =>
    onChange(languages.map((l) => (l.id === id ? { ...l, ...patch } : l)));

  return (
    <div className="space-y-4">
      <p className="text-sm text-text-secondary">Levels are your own description, not an assessment. Leave any of them blank.</p>
      {languages.length === 0 && (
        <p className="rounded-xl border border-dashed border-border-strong px-4 py-3 text-sm text-text-secondary">No languages yet.</p>
      )}
      <ul className="space-y-3">
        {languages.map((l) => (
          <li key={l.id} className="rounded-xl border border-border-default bg-background-surface p-4">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="break-words font-medium text-text-primary">{l.name}</p>
              <IconButton
                icon={<Trash2Icon />}
                label={`Remove ${l.name}`}
                variant="ghost"
                size="md"
                onClick={() => onChange(languages.filter((x) => x.id !== l.id))}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Select
                fullWidth
                label="How you’d describe it"
                value={l.level ?? ''}
                onChange={(e) => update(l.id, { level: (e.target.value || null) as Level | null })}
                options={[{ label: 'No description', value: '' }, ...LEVELS.map((o) => ({ label: o.label.en, value: o.value }))]}
              />
              <div className="flex items-end pb-2">
                <Checkbox
                  label="Currently learning"
                  checked={l.learning}
                  onChange={(e) => update(l.id, { learning: e.target.checked })}
                />
              </div>
            </div>
            <div className="mt-3">
              <ShortTextInput
                label="Clarification (optional)"
                value={l.note}
                onChange={(v) => update(l.id, { note: v })}
                placeholder="e.g., I read comfortably but struggle to speak."
                checkDiagnostic
              />
            </div>
          </li>
        ))}
      </ul>
      {atLimit ? (
        <p className="text-sm text-text-secondary">You’ve listed {LIMITS.languages} languages, the most a portrait can hold. Remove one to add another.</p>
      ) : (
        <div className="space-y-3">
          {suggestions.length > 0 && (
            <div role="group" aria-label="Add a suggested language" className="flex flex-wrap gap-2">
              {suggestions.map((s) => (
                <ChoiceChip key={s} label={s} selected={false} onToggle={() => add(s)} />
              ))}
            </div>
          )}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
            <div className="min-w-0 flex-1">
              <Input
                label="Another language"
                value={custom}
                error={customError}
                placeholder="e.g., Catalan"
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !customError) {
                    e.preventDefault();
                    add(custom);
                    setCustom('');
                  }
                }}
              />
            </div>
            <Button
              variant="secondary"
              className="sm:mt-6"
              leadingIcon={<PlusIcon className="h-4 w-4" />}
              disabled={!custom.trim() || Boolean(customError)}
              onClick={() => {
                add(custom);
                setCustom('');
              }}
            >
              Add
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

