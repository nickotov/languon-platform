import { LENGTHS, ORDERS, TONES, WORDINGS } from '../data/portraitOptions';
import type { ChatField, ChatState, SavedPortrait } from '../types/portrait';

export const CHAT_FIELDS: { key: ChatField; label: string; options: { value: string; label: string }[] }[] = [
  {
    key: 'explanationLanguage',
    label: 'Explanation language',
    options: ['English', 'Spanish', 'French', 'Russian'].map((l) => ({ value: l, label: l })),
  },
  { key: 'tone', label: 'Tone', options: TONES.map((o) => ({ value: o.value, label: o.label.en })) },
  { key: 'length', label: 'Explanation length', options: LENGTHS.map((o) => ({ value: o.value, label: o.label.en })) },
  { key: 'wording', label: 'Wording', options: WORDINGS.map((o) => ({ value: o.value, label: o.label.en })) },
  { key: 'order', label: 'Examples or theory', options: ORDERS.map((o) => ({ value: o.value, label: o.label.en })) },
];

export const MANUAL_DEFAULTS: Record<ChatField, string> = {
  explanationLanguage: 'English',
  tone: 'balanced',
  length: 'detailed',
  wording: 'balanced',
  order: 'balance',
};

export function portraitValue(portrait: SavedPortrait | null, field: ChatField): string | null {
  if (!portrait) return null;
  const i = portrait.items;
  switch (field) {
    case 'explanationLanguage':
      return i.explanationLanguages[0] ?? null;
    case 'tone':
      return i.tone;
    case 'length':
      return i.length;
    case 'wording':
      return i.wording;
    case 'order':
      return i.order;
  }
}

export function portraitApplies(portrait: SavedPortrait | null, chat: ChatState): boolean {
  return Boolean(portrait?.useEnabled) && !chat.excludePortrait && (chat.isNew || chat.adoptedPortrait);
}

export function effectiveSetting(portrait: SavedPortrait | null, chat: ChatState, field: ChatField): { value: string; origin: 'portrait' | 'manual'; overridden: boolean } {
  const override = chat.overrides[field];
  if (override) return { value: override, origin: 'manual', overridden: true };
  const pv = portraitValue(portrait, field);
  if (portraitApplies(portrait, chat) && pv) return { value: pv, origin: 'portrait', overridden: false };
  return { value: MANUAL_DEFAULTS[field], origin: 'manual', overridden: false };
}

export function settingLabel(field: ChatField, value: string): string {
  return CHAT_FIELDS.find((f) => f.key === field)?.options.find((o) => o.value === value)?.label ?? value;
}

