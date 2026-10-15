import { languages } from '../data/languages'
import type { LanguageCode } from '../types/texts'

export function languageName(code: LanguageCode | '' | undefined): string {
  if (!code) return 'Not chosen'
  return languages.find((l) => l.code === code)?.name ?? code
}

export function directionLabel(from: LanguageCode, to: LanguageCode): string {
  return `${languageName(from)} → ${languageName(to)}`
}

/** Very small heuristic used only to simulate the advisory "Detect language" action. */
export function guessLanguage(text: string): LanguageCode {
  const t = ` ${text.toLowerCase()} `
  const score = (words: string[]) => words.reduce((n, w) => n + (t.includes(` ${w} `) ? 1 : 0), 0)
  const es = score(['el', 'la', 'los', 'las', 'y', 'que', 'en', 'un', 'una', 'se', 'su', 'del', 'por']) + (/[ñ¿¡]/.test(t) ? 3 : 0)
  const fr = score(['le', 'la', 'les', 'et', 'est', 'un', 'une', 'des', 'du', 'je', 'il', 'pas']) + (/[çœ]|\bc'est\b/.test(t) ? 3 : 0)
  const en = score(['the', 'and', 'of', 'to', 'a', 'in', 'is', 'she', 'he', 'we', 'was', 'her', 'his'])
  if (es >= fr && es > en) return 'es'
  if (fr > es && fr > en) return 'fr'
  return 'en'
}
