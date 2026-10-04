import type { LanguageCode } from '../types/dictionary'
import type {
  AiResult,
  Correction,
  PracticeExercise,
  Rating,
  TargetStatus,
} from '../types/practice'

export function ratingFor(score: number): Rating {
  if (score >= 100) return 'perfect'
  if (score >= 80) return 'good'
  if (score >= 50) return 'not-bad'
  return 'again'
}

type Lang = 'en' | 'de' | 'es' | 'fr' | 'ru'
const asLang = (code: LanguageCode): Lang =>
  (['en', 'de', 'es', 'fr', 'ru'] as string[]).includes(code) ? (code as Lang) : 'en'

export const EXPLANATION_LANGUAGES: LanguageCode[] = ['de', 'en', 'es', 'fr', 'ru']

const ratingLabels: Record<Lang, Record<Rating, string>> = {
  en: { perfect: 'Perfect', good: 'Good', 'not-bad': 'Not bad', again: 'Practise again later' },
  de: { perfect: 'Perfekt', good: 'Gut', 'not-bad': 'Nicht schlecht', again: 'Später noch einmal üben' },
  es: { perfect: 'Perfecto', good: 'Bien', 'not-bad': 'No está mal', again: 'Practica de nuevo más tarde' },
  fr: { perfect: 'Parfait', good: 'Bien', 'not-bad': 'Pas mal', again: 'À retravailler plus tard' },
  ru: { perfect: 'Отлично', good: 'Хорошо', 'not-bad': 'Неплохо', again: 'Потренируйтесь позже' },
}

export function ratingLabel(rating: Rating, language: LanguageCode): string {
  return ratingLabels[asLang(language)][rating]
}

const summaries: Record<Lang, Record<Rating, string>> = {
  en: {
    perfect: 'Everything is correct: meaning, grammar and all target words.',
    good: 'The translation is correct overall, with a small issue to polish.',
    'not-bad': 'The meaning comes across, but something important needs attention.',
    again: 'The translation needs more work — compare it with the corrections below.',
  },
  de: {
    perfect: 'Alles korrekt: Bedeutung, Grammatik und alle Zielwörter stimmen.',
    good: 'Die Übersetzung ist insgesamt richtig, mit einer kleinen Unstimmigkeit.',
    'not-bad': 'Die Bedeutung kommt an, aber etwas Wichtiges fehlt noch.',
    again: 'Die Übersetzung braucht noch Arbeit — vergleiche sie mit den Korrekturen.',
  },
  es: {
    perfect: 'Todo es correcto: significado, gramática y todas las palabras objetivo.',
    good: 'La traducción es correcta en general, con un pequeño detalle.',
    'not-bad': 'El significado se entiende, pero falta algo importante.',
    again: 'La traducción necesita más trabajo; compárala con las correcciones.',
  },
  fr: {
    perfect: 'Tout est correct : sens, grammaire et tous les mots cibles.',
    good: 'La traduction est globalement correcte, avec un petit point à revoir.',
    'not-bad': 'Le sens passe, mais un élément important manque.',
    again: 'La traduction demande encore du travail ; comparez-la aux corrections.',
  },
  ru: {
    perfect: 'Всё верно: смысл, грамматика и все целевые слова.',
    good: 'Перевод в целом верный, есть небольшая неточность.',
    'not-bad': 'Смысл понятен, но не хватает важного элемента.',
    again: 'Перевод требует доработки — сравните его с исправлениями.',
  },
}

const missingNote: Record<Lang, (words: string) => string> = {
  en: (words) => `Required vocabulary is missing (${words}), so the rating is limited to 79 at most.`,
  de: (words) => `Pflichtvokabular fehlt (${words}) — die Bewertung ist auf höchstens 79 begrenzt.`,
  es: (words) => `Falta vocabulario obligatorio (${words}); la nota se limita a 79 como máximo.`,
  fr: (words) => `Du vocabulaire obligatoire manque (${words}) ; la note est limitée à 79.`,
  ru: (words) => `Не хватает обязательной лексики (${words}), поэтому оценка не выше 79.`,
}

const synonymNote: Record<Lang, (used: string, target: string) => string> = {
  en: (used, target) => `“${used}” is a synonym; this exercise asks for “${target}”.`,
  de: (used, target) => `„${used}“ ist ein Synonym; diese Übung verlangt „${target}“.`,
  es: (used, target) => `“${used}” es un sinónimo; este ejercicio pide “${target}”.`,
  fr: (used, target) => `« ${used} » est un synonyme ; cet exercice demande « ${target} ».`,
  ru: (used, target) => `«${used}» — синоним; в этом упражнении нужно «${target}».`,
}

const punctuationNote: Record<Lang, string> = {
  en: 'End the sentence with punctuation.',
  de: 'Beende den Satz mit einem Satzzeichen.',
  es: 'Termina la frase con un signo de puntuación.',
  fr: 'Terminez la phrase par une ponctuation.',
  ru: 'Завершите предложение знаком препинания.',
}

const spellingNote: Record<Lang, (wrong: string, right: string) => string> = {
  en: (wrong, right) => `Spelling: “${wrong}” → “${right}”.`,
  de: (wrong, right) => `Rechtschreibung: „${wrong}“ → „${right}“.`,
  es: (wrong, right) => `Ortografía: “${wrong}” → “${right}”.`,
  fr: (wrong, right) => `Orthographe : « ${wrong} » → « ${right} ».`,
  ru: (wrong, right) => `Орфография: «${wrong}» → «${right}».`,
}

const commonMisspellings: Record<string, string> = {
  toady: 'today',
  wrok: 'work',
  fot: 'foot',
  erly: 'early',
  wether: 'weather',
}

/** Split into user-perceived characters so highlights never cut a grapheme. */
export function graphemes(text: string): string[] {
  const Segmenter = (Intl as unknown as {
    Segmenter?: new (locale?: string, options?: { granularity: string }) => {
      segment: (input: string) => Iterable<{ segment: string }>
    }
  }).Segmenter
  if (Segmenter) {
    return Array.from(new Segmenter(undefined, { granularity: 'grapheme' }).segment(text)).map(
      (part) => part.segment,
    )
  }
  return Array.from(text)
}

/** Snap a code-unit span outward to grapheme boundaries. */
export function alignSpan(text: string, start: number, end: number) {
  const boundaries = [0]
  graphemes(text).forEach((part) => boundaries.push(boundaries[boundaries.length - 1] + part.length))
  const alignedStart = [...boundaries].reverse().find((boundary) => boundary <= start) ?? 0
  const alignedEnd = boundaries.find((boundary) => boundary >= end) ?? text.length
  return { start: alignedStart, end: alignedEnd }
}

export interface AnswerSegment {
  text: string
  correction?: Correction
}

/** Split the exact submitted answer into plain and corrected runs. */
export function segmentAnswer(answer: string, corrections: Correction[]): AnswerSegment[] {
  const spans = corrections
    .filter((correction) => correction.span)
    .map((correction) => ({
      correction,
      ...alignSpan(answer, correction.span!.start, correction.span!.end),
    }))
    .sort((a, b) => a.start - b.start)

  const segments: AnswerSegment[] = []
  let cursor = 0
  spans.forEach((span) => {
    if (span.start < cursor) return
    if (span.start > cursor) segments.push({ text: answer.slice(cursor, span.start) })
    segments.push({ text: answer.slice(span.start, span.end), correction: span.correction })
    cursor = span.end
  })
  if (cursor < answer.length) segments.push({ text: answer.slice(cursor) })
  return segments
}

const normalize = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[.!?。]+$/u, '')
    .replace(/\s+/g, ' ')

function findWord(answer: string, word: string): number {
  const pattern = new RegExp(`(^|[^\\p{L}])(${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?=$|[^\\p{L}])`, 'iu')
  const match = pattern.exec(answer)
  return match ? match.index + match[1].length : -1
}

let correctionCounter = 0

/** Deterministic stand-in for the AI checker, following the product grading rules. */
export function mockCheck(
  exercise: PracticeExercise,
  answer: string,
  explanationLanguage: LanguageCode,
): AiResult {
  const lang = asLang(explanationLanguage)
  const corrections: Correction[] = []
  const targets: TargetStatus[] = exercise.targets.map((target) => {
    const used = target.acceptedForms.some((form) => findWord(answer, form) >= 0)
    if (used) return { targetId: target.id, hint: target.hint, status: 'used' }
    const synonym = target.synonyms?.find((candidate) => findWord(answer, candidate) >= 0)
    if (synonym) {
      const start = findWord(answer, synonym)
      corrections.push({
        id: `c-${++correctionCounter}`,
        kind: 'vocabulary',
        original: answer.slice(start, start + synonym.length),
        suggestion: target.hint,
        note: synonymNote[lang](synonym, target.hint),
        span: { start, end: start + synonym.length },
      })
      return { targetId: target.id, hint: target.hint, status: 'synonym', note: synonym }
    }
    return { targetId: target.id, hint: target.hint, status: 'missing' }
  })

  Object.entries(commonMisspellings).forEach(([wrong, right]) => {
    const start = findWord(answer, wrong)
    if (start >= 0) {
      corrections.push({
        id: `c-${++correctionCounter}`,
        kind: 'spelling',
        original: answer.slice(start, start + wrong.length),
        suggestion: right,
        note: spellingNote[lang](wrong, right),
        span: { start, end: start + wrong.length },
      })
    }
  })

  if (!/[.!?。]\s*$/u.test(answer)) {
    corrections.push({
      id: `c-${++correctionCounter}`,
      kind: 'punctuation',
      original: null,
      suggestion: '.',
      note: punctuationNote[lang],
      span: null,
    })
  }

  const missing = targets.filter((target) => target.status !== 'used')
  const exact = normalize(answer) === normalize(exercise.reference)
  const overlap = (() => {
    const words = new Set(normalize(exercise.reference).split(' '))
    const given = normalize(answer).split(' ')
    return given.filter((word) => words.has(word)).length / Math.max(words.size, 1)
  })()

  let score: number
  if (exact && corrections.length === 0) score = 100
  else if (missing.length === 0) score = Math.max(80, 96 - corrections.length * 6)
  else score = Math.min(79, 74 - (missing.length - 1) * 12 - corrections.filter((item) => item.kind === 'spelling').length * 4)
  if (overlap < 0.25) score = Math.min(score, 30)
  // Any real issue prevents a perfect grade.
  if (corrections.length > 0) score = Math.min(score, 99)
  score = Math.max(0, Math.round(score))

  const rating = ratingFor(score)
  const details: string[] = []
  if (missing.length > 0) {
    details.push(missingNote[lang](missing.map((target) => `“${target.hint}”`).join(', ')))
  }

  return {
    score,
    rating,
    explanation: summaries[lang][rating],
    explanationLanguage,
    corrections,
    targets,
    improved: score === 100 ? undefined : exercise.reference,
    details,
  }
}

