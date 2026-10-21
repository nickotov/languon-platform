import React from 'react';
import { Checkbox } from '../Checkbox';
import { Select } from '../Select';
import { ChoiceChip, ChipGroup } from '../portrait/editor/ChoiceChip';
import {
  AGE_RANGES,
  GOALS,
  LENGTHS,
  LEVELS,
  MIXING,
  NEEDS,
  ORDERS,
  SUGGESTED_INTERESTS,
  SUGGESTED_LANGUAGES,
  TONES,
  WORDINGS,
  languageName,
  type Option,
} from '../../data/portraitOptions';
import type { Level } from '../../types/portrait';
import type { StyleState } from './useQuestionState';
import { useQuestionState } from './useQuestionState';

type Q = ReturnType<typeof useQuestionState>;

function toggle(list: string[], v: string) {
  return list.includes(v) ? list.filter((x) => x !== v) : [...list, v];
}

function RadioChips<T extends string>({ legend, options, value, onChange, lang }: { legend: string; options: Option<T>[]; value: T | null; onChange: (v: T | null) => void; lang: Q['lang'] }) {
  return (
    <ChipGroup legend={legend} role="radiogroup">
      {options.map((o) => (
        <ChoiceChip key={o.value} role="radio" label={o.label[lang]} selected={value === o.value} onToggle={() => onChange(value === o.value ? null : o.value)} />
      ))}
    </ChipGroup>
  );
}

export function QuestionFields({ q }: { q: Q }) {
  const { lang } = q;
  switch (q.topic) {
    case 'languages': {
      const options = Array.from(new Set([...SUGGESTED_LANGUAGES, ...q.languages.map((l) => l.name)]));
      return (
        <div className="space-y-4">
          <ChipGroup legend="Languages you know" description="Select all that apply.">
            {options.map((name) => (
              <ChoiceChip key={name} label={languageName(name, lang)} selected={q.languages.some((l) => l.name === name)} onToggle={() => q.toggleLanguage(name)} />
            ))}
          </ChipGroup>
          {q.languages.length > 0 && (
            <ul className="space-y-2" aria-label="Describe each language">
              {q.languages.map((l) => (
                <li key={l.id} className="grid gap-2 rounded-xl bg-background-subtle p-3 sm:grid-cols-3 sm:items-end">
                  <p className="font-medium text-text-primary sm:pb-3">{languageName(l.name, lang)}</p>
                  <Select
                    fullWidth
                    size="md"
                    label="Your description"
                    value={l.level ?? ''}
                    onChange={(e) => q.setLanguages((ls) => ls.map((x) => (x.id === l.id ? { ...x, level: (e.target.value || null) as Level | null } : x)))}
                    options={[{ label: '—', value: '' }, ...LEVELS.map((o) => ({ label: o.label[lang], value: o.value }))]}
                  />
                  <div className="sm:pb-2">
                    <Checkbox
                      label="Learning now"
                      checked={l.learning}
                      onChange={(e) => q.setLanguages((ls) => ls.map((x) => (x.id === l.id ? { ...x, learning: e.target.checked } : x)))}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      );
    }
    case 'explanation': {
      const options = Array.from(new Set([...q.languages.map((l) => l.name), 'English', 'Spanish', 'French', 'Russian', ...q.explanation]));
      return (
        <div className="space-y-4">
          <ChipGroup legend="Comfortable for explanations" description="Select all that apply.">
            {options.map((name) => (
              <ChoiceChip key={name} label={languageName(name, lang)} selected={q.explanation.includes(name)} onToggle={() => q.setExplanation((e) => toggle(e, name))} />
            ))}
          </ChipGroup>
          <RadioChips legend="Are mixed-language explanations helpful?" options={MIXING} value={q.mixing} onChange={q.setMixing} lang={lang} />
        </div>
      );
    }
    case 'goals':
      return (
        <ChipGroup legend="Goals" description="Select all that apply.">
          {GOALS.map((g) => (
            <ChoiceChip key={g.value} label={g.label[lang]} selected={q.goals.includes(g.value)} onToggle={() => q.setGoals((x) => toggle(x, g.value))} />
          ))}
        </ChipGroup>
      );
    case 'style': {
      const set = <K extends keyof StyleState>(k: K) => (v: StyleState[K]) => q.setStyle((s) => ({ ...s, [k]: v }));
      return (
        <div className="space-y-4">
          <RadioChips legend="Tone" options={TONES} value={q.style.tone} onChange={set('tone')} lang={lang} />
          <RadioChips legend="Explanation length" options={LENGTHS} value={q.style.length} onChange={set('length')} lang={lang} />
          <RadioChips legend="Wording" options={WORDINGS} value={q.style.wording} onChange={set('wording')} lang={lang} />
          <RadioChips legend="Examples or theory" options={ORDERS} value={q.style.order} onChange={set('order')} lang={lang} />
        </div>
      );
    }
    case 'needs':
      return (
        <ChipGroup legend="Helpful approaches" description="Select all that apply.">
          {NEEDS.map((n) => (
            <ChoiceChip key={n.value} label={n.label[lang]} selected={q.needs.includes(n.value)} onToggle={() => q.setNeeds((x) => toggle(x, n.value))} />
          ))}
        </ChipGroup>
      );
    case 'interests':
      return (
        <ChipGroup legend="Interests" description="Select all that apply.">
          {Array.from(new Set([...SUGGESTED_INTERESTS, ...q.interests])).map((i) => (
            <ChoiceChip key={i} label={i} selected={q.interests.includes(i)} onToggle={() => q.setInterests((x) => toggle(x, i))} />
          ))}
        </ChipGroup>
      );
    case 'age':
      return <RadioChips legend="Age range" options={AGE_RANGES} value={q.age} onChange={q.setAge} lang={lang} />;
  }
}

