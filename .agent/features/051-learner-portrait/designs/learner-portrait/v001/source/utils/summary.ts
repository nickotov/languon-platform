import { AGE_RANGES, LEVELS, labelOf, languageName } from '../data/portraitOptions';
import type { LangCode, LanguageEntry, PortraitItems } from '../types/portrait';

interface Phrases {
  and: string;
  native: (l: string) => string;
  known: (l: string) => string;
  learning: (l: string) => string;
  langNote: (name: string, note: string) => string;
  explanation: (l: string) => string;
  mixing: Record<'helpful' | 'sometimes' | 'avoid' | 'none', string>;
  mixingNote: (n: string) => string;
  goals: (l: string) => string;
  goal: Record<string, string>;
  style: (l: string) => string;
  tone: Record<string, string>;
  length: Record<string, string>;
  defaultLength: string;
  order: Record<string, string>;
  wording: Record<string, string>;
  needs: (l: string) => string;
  need: Record<string, string>;
  customNeed: (n: string) => string;
  interests: (l: string) => string;
  age: (a: string) => string;
  note: (n: string) => string;
  more: string;
  q: (s: string) => string;
}

const PHRASES: Record<LangCode, Phrases> = {
  en: {
    and: 'and',
    native: (l) => `You speak ${l} natively.`,
    known: (l) => `You also know ${l}.`,
    learning: (l) => `You're currently learning ${l}, as you describe your own levels.`,
    langNote: (n, note) => `About ${n}, you note: “${note}”`,
    explanation: (l) => `You prefer explanations in ${l}`,
    mixing: {
      helpful: ', with short examples in the language you’re studying.',
      sometimes: ', with occasional language mixing when it helps.',
      avoid: ', kept in one language.',
      none: '.',
    },
    mixingNote: (n) => ` You added: “${n}”`,
    goals: (l) => `You’re learning for ${l}.`,
    goal: { travel: 'travel', work: 'work', exams: 'exams', everyday: 'everyday conversation', interest: 'personal interest' },
    style: (l) => `You’d like ${l}.`,
    tone: { friendly: 'a friendly tone', balanced: 'a balanced tone', formal: 'a formal tone' },
    length: { concise: 'concise explanations', detailed: 'detailed explanations' },
    defaultLength: 'explanations',
    order: {
      examples: ' that start with an example before the rule',
      theory: ' that start with the rule before examples',
      balance: ' that balance examples and theory',
    },
    wording: { simple: ', in simple wording', balanced: ', in balanced wording', academic: ', in academic wording' },
    needs: (l) => `It helps to have ${l}.`,
    need: { 'short-steps': 'short steps', recaps: 'frequent recaps', structure: 'a clear structure', 'one-concept': 'one concept at a time' },
    customNeed: (n) => `You also mention: “${n}”`,
    interests: (l) => `Examples about ${l} are welcome.`,
    age: (a) => `You shared your age range (${a}) to help pick relevant examples.`,
    note: (n) => `You also noted: “${n}”`,
    more: 'More details are listed below.',
    q: (s) => `“${s}”`,
  },
  es: {
    and: 'y',
    native: (l) => `Hablas ${l} como lengua materna.`,
    known: (l) => `También conoces ${l}.`,
    learning: (l) => `Ahora estás aprendiendo ${l}, según tu propia descripción.`,
    langNote: (n, note) => `Sobre el ${n}, comentas: “${note}”`,
    explanation: (l) => `Prefieres explicaciones en ${l}`,
    mixing: {
      helpful: ', con ejemplos breves en el idioma que estudias.',
      sometimes: ', mezclando idiomas de vez en cuando si ayuda.',
      avoid: ', en un solo idioma.',
      none: '.',
    },
    mixingNote: (n) => ` Añadiste: “${n}”`,
    goals: (l) => `Aprendes para ${l}.`,
    goal: { travel: 'viajar', work: 'el trabajo', exams: 'exámenes', everyday: 'la conversación cotidiana', interest: 'interés personal' },
    style: (l) => `Te gustan ${l}.`,
    tone: { friendly: 'un tono cercano', balanced: 'un tono equilibrado', formal: 'un tono formal' },
    length: { concise: 'explicaciones concisas', detailed: 'explicaciones detalladas' },
    defaultLength: 'explicaciones',
    order: {
      examples: ' que empiecen con un ejemplo y luego la regla',
      theory: ' que empiecen con la regla y luego ejemplos',
      balance: ' que equilibren ejemplos y teoría',
    },
    wording: { simple: ', con un lenguaje sencillo', balanced: ', con un lenguaje equilibrado', academic: ', con un lenguaje académico' },
    needs: (l) => `Te ayuda tener ${l}.`,
    need: { 'short-steps': 'pasos cortos', recaps: 'repasos frecuentes', structure: 'una estructura clara', 'one-concept': 'un concepto a la vez' },
    customNeed: (n) => `También mencionas: “${n}”`,
    interests: (l) => `Los ejemplos sobre ${l} son bienvenidos.`,
    age: (a) => `Compartiste tu rango de edad (${a}) para elegir ejemplos relevantes.`,
    note: (n) => `También anotaste: “${n}”`,
    more: 'Encontrarás más detalles abajo.',
    q: (s) => `“${s}”`,
  },
  fr: {
    and: 'et',
    native: (l) => `Vous parlez ${l} comme langue maternelle.`,
    known: (l) => `Vous connaissez aussi ${l}.`,
    learning: (l) => `Vous apprenez actuellement ${l}, d’après votre propre description.`,
    langNote: (n, note) => `À propos du ${n}, vous précisez : « ${note} »`,
    explanation: (l) => `Vous préférez des explications en ${l}`,
    mixing: {
      helpful: ', avec de courts exemples dans la langue étudiée.',
      sometimes: ', avec un mélange de langues quand cela aide.',
      avoid: ', dans une seule langue.',
      none: '.',
    },
    mixingNote: (n) => ` Vous avez ajouté : « ${n} »`,
    goals: (l) => `Vous apprenez pour ${l}.`,
    goal: { travel: 'voyager', work: 'le travail', exams: 'les examens', everyday: 'la conversation quotidienne', interest: 'le plaisir personnel' },
    style: (l) => `Vous aimez ${l}.`,
    tone: { friendly: 'un ton amical', balanced: 'un ton équilibré', formal: 'un ton formel' },
    length: { concise: 'des explications concises', detailed: 'des explications détaillées' },
    defaultLength: 'des explications',
    order: {
      examples: ' qui commencent par un exemple, puis la règle',
      theory: ' qui commencent par la règle, puis des exemples',
      balance: ' qui équilibrent exemples et théorie',
    },
    wording: { simple: ', avec un vocabulaire simple', balanced: ', avec un vocabulaire équilibré', academic: ', avec un vocabulaire académique' },
    needs: (l) => `Ce qui vous aide : ${l}.`,
    need: { 'short-steps': 'de petites étapes', recaps: 'des récapitulatifs fréquents', structure: 'une structure claire', 'one-concept': 'une notion à la fois' },
    customNeed: (n) => `Vous mentionnez aussi : « ${n} »`,
    interests: (l) => `Les exemples liés à ${l} sont bienvenus.`,
    age: (a) => `Vous avez indiqué votre tranche d’âge (${a}) pour choisir des exemples pertinents.`,
    note: (n) => `Vous avez aussi noté : « ${n} »`,
    more: 'D’autres détails figurent ci-dessous.',
    q: (s) => `« ${s} »`,
  },
  ru: {
    and: 'и',
    native: (l) => `Ваш родной язык — ${l}.`,
    known: (l) => `Вы также знаете ${l}.`,
    learning: (l) => `Сейчас вы изучаете ${l} — уровень указан с ваших слов.`,
    langNote: (n, note) => `Про ${n} вы отмечаете: «${note}»`,
    explanation: (l) => `Вы предпочитаете объяснения на языке: ${l}`,
    mixing: {
      helpful: ', с короткими примерами на изучаемом языке.',
      sometimes: ', иногда со смешением языков, если это помогает.',
      avoid: ', на одном языке.',
      none: '.',
    },
    mixingNote: (n) => ` Вы добавили: «${n}»`,
    goals: (l) => `Ваши цели: ${l}.`,
    goal: { travel: 'путешествия', work: 'работа', exams: 'экзамены', everyday: 'повседневное общение', interest: 'личный интерес' },
    style: (l) => `Вам подходит ${l}.`,
    tone: { friendly: 'дружелюбный тон', balanced: 'нейтральный тон', formal: 'формальный тон' },
    length: { concise: 'краткие объяснения', detailed: 'подробные объяснения' },
    defaultLength: 'объяснения',
    order: {
      examples: ' — сначала пример, затем правило',
      theory: ' — сначала правило, затем примеры',
      balance: ' — с балансом примеров и теории',
    },
    wording: { simple: ', простыми словами', balanced: ', сбалансированным языком', academic: ', академическим языком' },
    needs: (l) => `Вам помогают ${l}.`,
    need: { 'short-steps': 'короткие шаги', recaps: 'частые повторы', structure: 'чёткая структура', 'one-concept': 'одна тема за раз' },
    customNeed: (n) => `Также вы упоминаете: «${n}»`,
    interests: (l) => `Приветствуются примеры, связанные с вашими интересами: ${l}.`,
    age: (a) => `Вы указали возрастной диапазон (${a}), чтобы подбирать уместные примеры.`,
    note: (n) => `Вы также отметили: «${n}»`,
    more: 'Остальные подробности — ниже.',
    q: (s) => `«${s}»`,
  },
};

function join(list: string[], and: string): string {
  if (list.length <= 1) return list.join('');
  return `${list.slice(0, -1).join(', ')} ${and} ${list[list.length - 1]}`;
}

function soft(s: string): string {
  return s.length > 1 && s[1] === s[1].toLowerCase() ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

function endSentence(s: string): string {
  return /[.!?…»”]$/.test(s) ? s : `${s}.`;
}

function words(s: string): number {
  return s.split(/\s+/).filter(Boolean).length;
}

const WORD_TARGET = 180;

export function generateSummary(items: PortraitItems, lang: LangCode = 'en'): string[] {
  const p = PHRASES[lang];
  const name = (l: LanguageEntry) => languageName(l.name, lang);
  const lvl = (l: LanguageEntry) => (l.level ? labelOf(LEVELS, l.level, lang).toLowerCase() : '');

  const priority: string[][] = [];

  const langSentences: string[] = [];
  const natives = items.languages.filter((l) => l.level === 'native' && !l.learning);
  const learning = items.languages.filter((l) => l.learning);
  const known = items.languages.filter((l) => !l.learning && l.level !== 'native');
  if (natives.length) langSentences.push(p.native(join(natives.map(name), p.and)));
  if (learning.length)
    langSentences.push(p.learning(join(learning.map((l) => (lvl(l) ? `${name(l)} (${lvl(l)})` : name(l))), p.and)));
  if (known.length) langSentences.push(p.known(join(known.map((l) => (lvl(l) ? `${name(l)} (${lvl(l)})` : name(l))), p.and)));
  items.languages.filter((l) => l.note.trim()).forEach((l) => langSentences.push(endSentence(p.langNote(name(l), l.note.trim()))));
  if (langSentences.length) priority.push(langSentences);

  const expl: string[] = [];
  if (items.explanationLanguages.length) {
    expl.push(
      p.explanation(join(items.explanationLanguages.map((l) => languageName(l, lang)), p.and)) +
        p.mixing[items.mixing ?? 'none'],
    );
  }
  if (items.mixingNote.trim()) expl.push(endSentence(p.mixingNote(items.mixingNote.trim()).trim()));
  if (expl.length) priority.push(expl);

  const goals = [...items.goals.map((g) => p.goal[g] ?? g), ...items.customGoals.map(soft)];
  if (goals.length) priority.push([p.goals(join(goals, p.and))]);

  const styleParts: string[] = [];
  if (items.tone) styleParts.push(p.tone[items.tone]);
  if (items.length || items.order || items.wording) {
    styleParts.push(
      (items.length ? p.length[items.length] : p.defaultLength) +
        (items.order ? p.order[items.order] : '') +
        (items.wording ? p.wording[items.wording] : ''),
    );
  }
  if (styleParts.length) priority.push([p.style(join(styleParts, p.and))]);

  const needs: string[] = [];
  if (items.needs.length) needs.push(p.needs(join(items.needs.map((n) => p.need[n] ?? n), p.and)));
  items.customNeeds.forEach((c) => needs.push(endSentence(p.customNeed(c))));
  if (needs.length) priority.push(needs);

  const extra: string[] = [];
  if (items.interests.length) extra.push(p.interests(join(items.interests.map((i) => i.toLowerCase()), p.and)));
  if (items.ageRange && items.ageRange !== 'prefer-not') extra.push(p.age(labelOf(AGE_RANGES, items.ageRange, lang)));
  if (extra.length) priority.push(extra);

  const notes = items.notes.map((n) => endSentence(p.note(n.text)));

  const paragraphs: string[] = [];
  let total = 0;
  let omitted = false;
  for (const group of priority) {
    const kept: string[] = [];
    for (const sentence of group) {
      if (total + words(sentence) > WORD_TARGET) {
        omitted = true;
        continue;
      }
      kept.push(sentence);
      total += words(sentence);
    }
    if (kept.length) paragraphs.push(kept.join(' '));
  }
  const keptNotes: string[] = [];
  for (const n of notes) {
    if (total + words(n) > WORD_TARGET) {
      omitted = true;
      continue;
    }
    keptNotes.push(n);
    total += words(n);
  }
  if (keptNotes.length) paragraphs.push(keptNotes.join(' '));
  if (omitted) paragraphs.push(p.more);

  // Merge short consecutive paragraphs into readable blocks of ~2-3 groups.
  const merged: string[] = [];
  paragraphs.forEach((para, i) => {
    if (i > 0 && merged.length && words(merged[merged.length - 1]) < 45) merged[merged.length - 1] += ` ${para}`;
    else merged.push(para);
  });
  return merged;
}

export function summaryWordCount(paragraphs: string[]): number {
  return paragraphs.reduce((acc, p) => acc + words(p), 0);
}

