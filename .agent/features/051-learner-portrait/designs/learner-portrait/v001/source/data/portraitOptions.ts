import type { AgeRange, LangCode, Length, Level, Mixing, Order, Tone, Wording } from '../types/portrait';

type Localized = Record<LangCode, string>;

export interface Option<T extends string> {
  value: T;
  label: Localized;
}

export const INTERVIEW_LANGUAGES: { value: LangCode; label: string; english: string }[] = [
  { value: 'en', label: 'English', english: 'English' },
  { value: 'ru', label: 'Русский', english: 'Russian' },
  { value: 'fr', label: 'Français', english: 'French' },
  { value: 'es', label: 'Español', english: 'Spanish' },
];

export const LANGUAGE_NAMES: Record<string, Localized> = {
  English: { en: 'English', ru: 'английский', fr: 'anglais', es: 'inglés' },
  Spanish: { en: 'Spanish', ru: 'испанский', fr: 'espagnol', es: 'español' },
  French: { en: 'French', ru: 'французский', fr: 'français', es: 'francés' },
  Russian: { en: 'Russian', ru: 'русский', fr: 'russe', es: 'ruso' },
  German: { en: 'German', ru: 'немецкий', fr: 'allemand', es: 'alemán' },
  Italian: { en: 'Italian', ru: 'итальянский', fr: 'italien', es: 'italiano' },
  Portuguese: { en: 'Portuguese', ru: 'португальский', fr: 'portugais', es: 'portugués' },
  Japanese: { en: 'Japanese', ru: 'японский', fr: 'japonais', es: 'japonés' },
};

export const SUGGESTED_LANGUAGES = Object.keys(LANGUAGE_NAMES);

export const LEVELS: Option<Level>[] = [
  { value: 'starting', label: { en: 'Just starting', ru: 'Только начинаю', fr: 'Je débute', es: 'Empezando' } },
  { value: 'basic', label: { en: 'Basic', ru: 'Базовый', fr: 'Notions de base', es: 'Básico' } },
  { value: 'intermediate', label: { en: 'Intermediate', ru: 'Средний', fr: 'Intermédiaire', es: 'Intermedio' } },
  { value: 'advanced', label: { en: 'Advanced', ru: 'Продвинутый', fr: 'Avancé', es: 'Avanzado' } },
  { value: 'fluent', label: { en: 'Fluent', ru: 'Свободно', fr: 'Courant', es: 'Fluido' } },
  { value: 'native', label: { en: 'Native', ru: 'Родной', fr: 'Langue maternelle', es: 'Nativo' } },
  { value: 'unsure', label: { en: 'Unsure', ru: 'Не уверен(а)', fr: 'Je ne sais pas', es: 'No estoy seguro' } },
];

export const MIXING: Option<Mixing>[] = [
  { value: 'helpful', label: { en: 'Yes, mixing helps', ru: 'Да, смешивание помогает', fr: 'Oui, le mélange m’aide', es: 'Sí, mezclar me ayuda' } },
  { value: 'sometimes', label: { en: 'Sometimes', ru: 'Иногда', fr: 'Parfois', es: 'A veces' } },
  { value: 'avoid', label: { en: 'Keep one language', ru: 'Лучше один язык', fr: 'Une seule langue', es: 'Mejor un solo idioma' } },
];

export const GOALS: Option<string>[] = [
  { value: 'travel', label: { en: 'Travel', ru: 'Путешествия', fr: 'Voyages', es: 'Viajes' } },
  { value: 'work', label: { en: 'Work', ru: 'Работа', fr: 'Travail', es: 'Trabajo' } },
  { value: 'exams', label: { en: 'Exams', ru: 'Экзамены', fr: 'Examens', es: 'Exámenes' } },
  { value: 'everyday', label: { en: 'Everyday conversation', ru: 'Повседневное общение', fr: 'Conversation quotidienne', es: 'Conversación cotidiana' } },
  { value: 'interest', label: { en: 'Personal interest', ru: 'Личный интерес', fr: 'Intérêt personnel', es: 'Interés personal' } },
];

export const TONES: Option<Tone>[] = [
  { value: 'friendly', label: { en: 'Friendly', ru: 'Дружелюбный', fr: 'Amical', es: 'Cercano' } },
  { value: 'balanced', label: { en: 'Balanced', ru: 'Нейтральный', fr: 'Équilibré', es: 'Equilibrado' } },
  { value: 'formal', label: { en: 'Formal', ru: 'Формальный', fr: 'Formel', es: 'Formal' } },
];

export const LENGTHS: Option<Length>[] = [
  { value: 'concise', label: { en: 'Concise', ru: 'Кратко', fr: 'Concis', es: 'Conciso' } },
  { value: 'detailed', label: { en: 'Detailed', ru: 'Подробно', fr: 'Détaillé', es: 'Detallado' } },
];

export const WORDINGS: Option<Wording>[] = [
  { value: 'simple', label: { en: 'Simple', ru: 'Простые слова', fr: 'Simple', es: 'Sencillo' } },
  { value: 'balanced', label: { en: 'Balanced', ru: 'Сбалансированно', fr: 'Équilibré', es: 'Equilibrado' } },
  { value: 'academic', label: { en: 'Academic', ru: 'Академично', fr: 'Académique', es: 'Académico' } },
];

export const ORDERS: Option<Order>[] = [
  { value: 'examples', label: { en: 'Examples first', ru: 'Сначала примеры', fr: 'Exemples d’abord', es: 'Primero ejemplos' } },
  { value: 'theory', label: { en: 'Theory first', ru: 'Сначала теория', fr: 'Théorie d’abord', es: 'Primero teoría' } },
  { value: 'balance', label: { en: 'A balance', ru: 'Поровну', fr: 'Un équilibre', es: 'Un equilibrio' } },
];

export const NEEDS: Option<string>[] = [
  { value: 'short-steps', label: { en: 'Short steps', ru: 'Короткие шаги', fr: 'Petites étapes', es: 'Pasos cortos' } },
  { value: 'recaps', label: { en: 'Frequent recaps', ru: 'Частые повторы', fr: 'Récapitulatifs fréquents', es: 'Repasos frecuentes' } },
  { value: 'structure', label: { en: 'Clear structure', ru: 'Чёткая структура', fr: 'Structure claire', es: 'Estructura clara' } },
  { value: 'one-concept', label: { en: 'One concept at a time', ru: 'Одна тема за раз', fr: 'Une notion à la fois', es: 'Un concepto a la vez' } },
];

export const SUGGESTED_INTERESTS = ['Cooking', 'Music', 'Football', 'Film', 'Technology', 'Gardening', 'Art', 'Hiking'];

export const AGE_RANGES: Option<AgeRange>[] = [
  { value: 'under18', label: { en: 'Under 18', ru: 'До 18', fr: 'Moins de 18 ans', es: 'Menos de 18' } },
  { value: '18-34', label: { en: '18–34', ru: '18–34', fr: '18–34 ans', es: '18–34' } },
  { value: '35-54', label: { en: '35–54', ru: '35–54', fr: '35–54 ans', es: '35–54' } },
  { value: '55plus', label: { en: '55+', ru: '55+', fr: '55 ans et plus', es: '55+' } },
  { value: 'prefer-not', label: { en: 'Prefer not to say', ru: 'Не хочу указывать', fr: 'Je préfère ne pas le dire', es: 'Prefiero no decirlo' } },
];

export const LIMITS = {
  customAnswer: 200,
  chatMessage: 1000,
  languages: 8,
  goals: 8,
  needs: 8,
  interests: 10,
  notes: 10,
};

export function labelOf<T extends string>(options: Option<T>[], value: T | null | undefined, lang: LangCode = 'en'): string {
  if (!value) return '';
  const found = options.find((o) => o.value === value);
  return found ? found.label[lang] : value;
}

export function languageName(name: string, lang: LangCode = 'en'): string {
  return LANGUAGE_NAMES[name]?.[lang] ?? name;
}

