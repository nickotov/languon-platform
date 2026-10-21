import React from 'react';
import { Trash2Icon } from 'lucide-react';
import { IconButton } from '../IconButton';
import { Radio, RadioGroup } from '../Radio';
import {
  AGE_RANGES,
  GOALS,
  LENGTHS,
  LIMITS,
  MIXING,
  NEEDS,
  ORDERS,
  SUGGESTED_INTERESTS,
  SUGGESTED_LANGUAGES,
  TONES,
  WORDINGS,
  type Option,
} from '../../data/portraitOptions';
import { TOPIC_LABELS } from '../../data/interviewCopy';
import type { PortraitItems } from '../../types/portrait';
import { ChoiceChip, ChipGroup } from './editor/ChoiceChip';
import { CustomEntryList } from './editor/CustomEntryList';
import { EditorSection } from './editor/EditorSection';
import { LanguagesEditor } from './editor/LanguagesEditor';
import { ShortTextInput } from './editor/ShortTextInput';

interface PortraitEditorProps {
  items: PortraitItems;
  onChange: (items: PortraitItems) => void;
}

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function StyleRadio<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Option<T>[];
  value: T | null;
  onChange: (v: T | null) => void;
}) {
  return (
    <RadioGroup label={label} value={value ?? ''} onChange={(v) => onChange((v || null) as T | null)} orientation="horizontal" size="sm">
      {options.map((o) => (
        <Radio key={o.value} value={o.value}>
          {o.label.en}
        </Radio>
      ))}
      <Radio value="">No preference</Radio>
    </RadioGroup>
  );
}

export function PortraitEditor({ items, onChange }: PortraitEditorProps) {
  const set = <K extends keyof PortraitItems>(key: K, value: PortraitItems[K]) => onChange({ ...items, [key]: value });
  const explanationChoices = Array.from(new Set([...items.languages.map((l) => l.name), ...SUGGESTED_LANGUAGES.slice(0, 4), ...items.explanationLanguages]));
  const goalCount = items.goals.length + items.customGoals.length;
  const needCount = items.needs.length + items.customNeeds.length;
  const customInterests = items.interests.filter((i) => !SUGGESTED_INTERESTS.includes(i));

  return (
    <div className="space-y-4">
      <EditorSection id="ed-languages" title="Languages and levels" description="Languages you know, which you’re learning now, and how you’d describe each." count={items.languages.length}>
        <LanguagesEditor languages={items.languages} onChange={(v) => set('languages', v)} />
      </EditorSection>

      <EditorSection
        id="ed-explanation"
        title="Explanation languages"
        description="Languages that feel comfortable for explanations. Separate from the app’s interface language and from what you’re studying."
        count={items.explanationLanguages.length + (items.mixing ? 1 : 0)}
      >
        <ChipGroup legend="Comfortable for explanations">
          {explanationChoices.map((name) => (
            <ChoiceChip key={name} label={name} selected={items.explanationLanguages.includes(name)} onToggle={() => set('explanationLanguages', toggle(items.explanationLanguages, name))} />
          ))}
        </ChipGroup>
        <RadioGroup label="Are mixed-language explanations helpful?" value={items.mixing ?? ''} onChange={(v) => set('mixing', (v || null) as PortraitItems['mixing'])} orientation="horizontal" size="sm">
          {MIXING.map((o) => (
            <Radio key={o.value} value={o.value}>
              {o.label.en}
            </Radio>
          ))}
          <Radio value="">No preference</Radio>
        </RadioGroup>
        <ShortTextInput label="In your words (optional)" value={items.mixingNote} onChange={(v) => set('mixingNote', v)} placeholder="e.g., Mostly English, with short Spanish examples." />
      </EditorSection>

      <EditorSection id="ed-goals" title="Goals and situations" count={goalCount}>
        <ChipGroup legend="What you’re learning for">
          {GOALS.map((g) => (
            <ChoiceChip
              key={g.value}
              label={g.label.en}
              selected={items.goals.includes(g.value)}
              disabled={!items.goals.includes(g.value) && goalCount >= LIMITS.goals}
              onToggle={() => set('goals', toggle(items.goals, g.value))}
            />
          ))}
        </ChipGroup>
        <CustomEntryList label="Your own goal" noun="goals" entries={items.customGoals} onChange={(v) => set('customGoals', v)} placeholder="e.g., Workplace conversation" max={LIMITS.goals} totalCount={goalCount} />
      </EditorSection>

      <EditorSection id="ed-style" title="Tone and explanation style" description="Each choice is independent." count={[items.tone, items.length, items.wording, items.order].filter(Boolean).length}>
        <StyleRadio label="Tone" options={TONES} value={items.tone} onChange={(v) => set('tone', v)} />
        <StyleRadio label="Explanation length" options={LENGTHS} value={items.length} onChange={(v) => set('length', v)} />
        <StyleRadio label="Wording" options={WORDINGS} value={items.wording} onChange={(v) => set('wording', v)} />
        <StyleRadio label="Examples or theory" options={ORDERS} value={items.order} onChange={(v) => set('order', v)} />
      </EditorSection>

      <EditorSection
        id="ed-needs"
        title="Practical learning needs"
        description="Accommodations that help — no need to say why. Diagnostic labels aren’t saved."
        count={needCount}
      >
        <ChipGroup legend="Helpful approaches">
          {NEEDS.map((n) => (
            <ChoiceChip
              key={n.value}
              label={n.label.en}
              selected={items.needs.includes(n.value)}
              disabled={!items.needs.includes(n.value) && needCount >= LIMITS.needs}
              onToggle={() => set('needs', toggle(items.needs, n.value))}
            />
          ))}
        </ChipGroup>
        <CustomEntryList
          label="Something else that helps"
          noun="learning needs"
          entries={items.customNeeds}
          onChange={(v) => set('customNeeds', v)}
          placeholder="e.g., A quick check question after each new rule"
          max={LIMITS.needs}
          totalCount={needCount}
          checkDiagnostic
        />
      </EditorSection>

      <EditorSection id="ed-extra" title="Interests and age range" optional description="Used only to make examples more relevant." count={items.interests.length + (items.ageRange && items.ageRange !== 'prefer-not' ? 1 : 0)}>
        <ChipGroup legend="Interests for examples">
          {SUGGESTED_INTERESTS.map((i) => (
            <ChoiceChip
              key={i}
              label={i}
              selected={items.interests.includes(i)}
              disabled={!items.interests.includes(i) && items.interests.length >= LIMITS.interests}
              onToggle={() => set('interests', toggle(items.interests, i))}
            />
          ))}
        </ChipGroup>
        <CustomEntryList
          label="Another interest"
          noun="interests"
          entries={customInterests}
          onChange={(v) => set('interests', [...items.interests.filter((i) => SUGGESTED_INTERESTS.includes(i)), ...v])}
          placeholder="e.g., Board games"
          max={LIMITS.interests}
          totalCount={items.interests.length}
        />
        <RadioGroup
          label="Age range"
          description="Helps pick relevant examples and life context. It never sets difficulty, maturity, or tone."
          value={items.ageRange ?? ''}
          onChange={(v) => set('ageRange', (v || null) as PortraitItems['ageRange'])}
          orientation="horizontal"
          size="sm"
        >
          {AGE_RANGES.map((a) => (
            <Radio key={a.value} value={a.value}>
              {a.label.en}
            </Radio>
          ))}
        </RadioGroup>
      </EditorSection>

      {items.notes.length > 0 && (
        <EditorSection id="ed-notes" title="Confirmed notes" description="Notes you added from the interview chat." count={items.notes.length}>
          <ul className="space-y-3">
            {items.notes.map((n) => (
              <li key={n.id} className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <ShortTextInput
                    label={`Note · ${TOPIC_LABELS[n.topic]}`}
                    value={n.text}
                    checkDiagnostic
                    onChange={(v) => set('notes', items.notes.map((x) => (x.id === n.id ? { ...x, text: v } : x)))}
                  />
                </div>
                <IconButton className="mt-6" icon={<Trash2Icon />} label="Remove note" variant="ghost" onClick={() => set('notes', items.notes.filter((x) => x.id !== n.id))} />
              </li>
            ))}
          </ul>
        </EditorSection>
      )}
    </div>
  );
}

