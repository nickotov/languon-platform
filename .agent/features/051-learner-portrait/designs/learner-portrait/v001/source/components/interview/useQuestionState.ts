import { useState } from 'react';
import {
  AGE_RANGES,
  GOALS,
  LEVELS,
  LIMITS,
  MIXING,
  NEEDS,
  ORDERS,
  TONES,
  LENGTHS,
  WORDINGS,
  labelOf,
  languageName,
} from '../../data/portraitOptions';
import type { AgeRange, Interview, LanguageEntry, Length, Mixing, Order, PortraitItems, Tone, Wording } from '../../types/portrait';
import { uid, validateShortText } from '../../utils/text';

export interface StyleState {
  tone: Tone | null;
  length: Length | null;
  wording: Wording | null;
  order: Order | null;
}

/** Local, unsent selection state for the current question. Changing it never triggers a request. */
export function useQuestionState(interview: Interview) {
  const d = interview.draft;
  const lang = interview.language;
  const [languages, setLanguages] = useState<LanguageEntry[]>(d.languages.map((l) => ({ ...l })));
  const [explanation, setExplanation] = useState<string[]>([...d.explanationLanguages]);
  const [mixing, setMixing] = useState<Mixing | null>(d.mixing);
  const [goals, setGoals] = useState<string[]>([...d.goals]);
  const [style, setStyle] = useState<StyleState>({ tone: d.tone, length: d.length, wording: d.wording, order: d.order });
  const [needs, setNeeds] = useState<string[]>([...d.needs]);
  const [interests, setInterests] = useState<string[]>([...d.interests]);
  const [age, setAge] = useState<AgeRange | null>(d.ageRange);
  const [custom, setCustom] = useState('');

  const topic = interview.topic;
  const customError = validateShortText(custom, LIMITS.customAnswer, topic === 'needs' || topic === 'languages');

  const toggleLanguage = (name: string) => {
    setLanguages((ls) =>
      ls.some((l) => l.name === name)
        ? ls.filter((l) => l.name !== name)
        : ls.length >= LIMITS.languages
          ? ls
          : [...ls, { id: uid('lang'), name, level: null, learning: false, note: '' }],
    );
  };

  const build = (): { label: string; apply: (p: PortraitItems) => PortraitItems; empty: boolean } => {
    const c = custom.trim();
    const withNote = (p: PortraitItems): PortraitItems =>
      c ? { ...p, notes: [...p.notes, { id: uid('note'), topic, text: c }] } : p;
    switch (topic) {
      case 'languages':
        return {
          empty: languages.length === 0 && !c,
          label: [
            ...languages.map((l) => {
              const bits = [l.level ? labelOf(LEVELS, l.level, lang) : '', l.learning ? 'learning' : ''].filter(Boolean).join(', ');
              return `${languageName(l.name, lang)}${bits ? ` (${bits})` : ''}`;
            }),
            c ? `“${c}”` : '',
          ]
            .filter(Boolean)
            .join(' · '),
          apply: (p) => withNote({ ...p, languages }),
        };
      case 'explanation':
        return {
          empty: explanation.length === 0 && !mixing && !c,
          label: [explanation.map((n) => languageName(n, lang)).join(', '), labelOf(MIXING, mixing, lang), c ? `“${c}”` : ''].filter(Boolean).join(' · '),
          apply: (p) => ({ ...p, explanationLanguages: explanation, mixing, mixingNote: c || p.mixingNote }),
        };
      case 'goals':
        return {
          empty: goals.length === 0 && !c,
          label: [...goals.map((g) => labelOf(GOALS, g, lang)), c ? `“${c}”` : ''].filter(Boolean).join(' · '),
          apply: (p) => ({ ...p, goals, customGoals: c && !p.customGoals.includes(c) ? [...p.customGoals, c] : p.customGoals }),
        };
      case 'style':
        return {
          empty: !style.tone && !style.length && !style.wording && !style.order && !c,
          label: [labelOf(TONES, style.tone, lang), labelOf(LENGTHS, style.length, lang), labelOf(WORDINGS, style.wording, lang), labelOf(ORDERS, style.order, lang), c ? `“${c}”` : '']
            .filter(Boolean)
            .join(' · '),
          apply: (p) => withNote({ ...p, ...style }),
        };
      case 'needs':
        return {
          empty: needs.length === 0 && !c,
          label: [...needs.map((n) => labelOf(NEEDS, n, lang)), c ? `“${c}”` : ''].filter(Boolean).join(' · '),
          apply: (p) => ({ ...p, needs, customNeeds: c && !p.customNeeds.includes(c) ? [...p.customNeeds, c] : p.customNeeds }),
        };
      case 'interests': {
        const all = c && !interests.includes(c) ? [...interests, c] : interests;
        return { empty: all.length === 0, label: all.join(' · '), apply: (p) => ({ ...p, interests: all.slice(0, LIMITS.interests) }) };
      }
      case 'age':
        return { empty: !age, label: labelOf(AGE_RANGES, age, lang), apply: (p) => ({ ...p, ageRange: age }) };
    }
  };

  return {
    lang,
    topic,
    languages,
    setLanguages,
    toggleLanguage,
    explanation,
    setExplanation,
    mixing,
    setMixing,
    goals,
    setGoals,
    style,
    setStyle,
    needs,
    setNeeds,
    interests,
    setInterests,
    age,
    setAge,
    custom,
    setCustom,
    customError,
    build,
  };
}

