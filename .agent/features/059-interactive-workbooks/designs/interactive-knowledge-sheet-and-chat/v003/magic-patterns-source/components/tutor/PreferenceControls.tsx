import React, { useState } from 'react';
import { CheckIcon, ChevronDownIcon, CpuIcon } from 'lucide-react';
import type { Level, Prefs, ReplyLanguage, Tone } from '../../types/tutor';
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverItem,
  PopoverSeparator,
  PopoverTrigger,
} from '../Popover';
import { models } from '../../data/models';
import { useTutorContext } from '../../contexts/TutorContext';

interface Option<T extends string> {
  value: T;
  short: string;
  description?: string;
}

const replyOptions: Option<ReplyLanguage>[] = [
  { value: 'Automatic', short: 'Auto', description: 'Follows the language of your question, not the quoted material' },
  { value: 'English', short: 'English' },
  { value: 'French', short: 'French' },
  { value: 'Spanish', short: 'Spanish' },
  { value: 'German', short: 'German' },
  { value: 'Arabic', short: 'Arabic' },
];

const toneOptions: Option<Tone>[] = [
  { value: 'Neutral', short: 'Neutral', description: 'Clear and even' },
  { value: 'Conversational', short: 'Casual', description: 'Warmer, like a study partner' },
  { value: 'Academic', short: 'Academic', description: 'Precise terminology' },
];

const levelOptions: Option<Level>[] = [
  { value: 'Automatic', short: 'Auto', description: 'Matches your question' },
  { value: 'Beginner-friendly', short: 'Beginner', description: 'Plain words, fewer terms' },
  { value: 'Detailed', short: 'Detailed', description: 'Allows depth and grammar terms — not always longer' },
];

function chipClass(touch: boolean) {
  // Compact visual height; on touch an invisible hit area keeps the 44px target.
  return `relative inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 text-xs text-text-secondary transition-colors hover:bg-background-subtle hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus data-[state=open]:bg-background-subtle ${
    touch ? 'h-8 after:absolute after:inset-x-0 after:-inset-y-1.5' : 'h-6'
  }`;
}

interface PrefPopoverProps<T extends string> {
  label: string;
  value: T;
  options: Option<T>[];
  onChange: (v: T) => void;
  touch: boolean;
}

function PrefPopover<T extends string>({ label, value, options, onChange, touch }: PrefPopoverProps<T>) {
  const { tutor } = useTutorContext();
  const [savedDefault, setSavedDefault] = useState(false);
  const current = options.find((o) => o.value === value) ?? options[0];
  return (
    <Popover onOpenChange={(o) => !o && setSavedDefault(false)}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`${label}: ${current.value}`} className={chipClass(touch)}>
          <span className="text-text-tertiary">{label}</span>
          <span className="font-medium text-text-primary">{current.short}</span>
          <ChevronDownIcon className="h-3 w-3 text-text-tertiary" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="start" collisionPadding={12} className="w-64 p-1">
        <PopoverHeader>{label}</PopoverHeader>
        {options.map((o) => (
          <PopoverItem key={o.value} selected={o.value === value} onClick={() => onChange(o.value)}>
            <span className="flex flex-col items-start text-left">
              <span>{o.value}</span>
              {o.description && <span className="text-xs text-text-tertiary">{o.description}</span>}
            </span>
          </PopoverItem>
        ))}
        <PopoverSeparator />
        <div className="flex items-center justify-between gap-2 px-2 py-1.5">
          <span className="text-xs text-text-tertiary">Applies to this conversation</span>
          {savedDefault ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-success-default" role="status">
              <CheckIcon className="h-3.5 w-3.5" aria-hidden="true" /> Saved as defaults
            </span>
          ) : (
            <button
              type="button"
              onClick={() => {
                tutor.saveDefaults();
                setSavedDefault(true);
              }}
              className="rounded-md px-1.5 py-1 text-xs font-medium text-primary-default hover:bg-primary-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            >
              Use as my defaults
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function PreferenceControls({ prefs }: { prefs: Prefs }) {
  const { tutor, platform } = useTutorContext();
  const touch = platform === 'mobile';
  return (
    <div className="flex items-center gap-0.5" role="group" aria-label="Answer preferences">
      <PrefPopover label="Reply" value={prefs.replyLanguage} options={replyOptions} onChange={(v) => tutor.setPrefs({ replyLanguage: v })} touch={touch} />
      <PrefPopover label="Tone" value={prefs.tone} options={toneOptions} onChange={(v) => tutor.setPrefs({ tone: v })} touch={touch} />
      <PrefPopover label="Level" value={prefs.level} options={levelOptions} onChange={(v) => tutor.setPrefs({ level: v })} touch={touch} />
    </div>
  );
}

export function ModelPicker() {
  const { tutor, platform } = useTutorContext();
  const touch = platform === 'mobile';
  const { model, unavailableModels, credits } = tutor.state;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`Model: ${model}. ${credits} credits left`} className={chipClass(touch)}>
          <CpuIcon className="h-3.5 w-3.5 text-text-tertiary" aria-hidden="true" />
          <span className="font-medium text-text-primary">{model}</span>
          <ChevronDownIcon className="h-3 w-3 text-text-tertiary" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" collisionPadding={12} className="w-72 p-1">
        <PopoverHeader>Model</PopoverHeader>
        {models.map((m) => {
          const down = unavailableModels.includes(m.name);
          return (
            <PopoverItem key={m.name} selected={m.name === model} disabled={down && m.name !== model} onClick={() => tutor.setModel(m.name)}>
              <span className="flex flex-col items-start text-left">
                <span>{m.name}</span>
                <span className="text-xs text-text-tertiary">{down ? 'Unavailable right now' : `${m.note} · ${m.cost}`}</span>
              </span>
            </PopoverItem>
          );
        })}
        <PopoverSeparator />
        <p className="px-2 py-1.5 text-xs text-text-tertiary">
          <span className="font-medium text-text-primary">{credits} credits</span> left. Token usage is under each answer.
        </p>
      </PopoverContent>
    </Popover>
  );
}

