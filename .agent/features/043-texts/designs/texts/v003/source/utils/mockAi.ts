import { cardGlossary } from '../data/cardGlossary'
import { seedTexts } from '../data/texts'
import { translationMemory } from '../data/translationMemory'
import type { LanguageCode, SentencePair } from '../types/texts'
import { languageName } from './languages'
import { splitSentences } from './sentences'

const memory: Record<string, string> = { ...translationMemory }
seedTexts.forEach((t) => t.pairs.forEach((p) => (memory[p.source] = p.target)))

/** Simulates whole-passage AI translation with fresh alignment and provenance. */
export function translatePassage(source: string, target: LanguageCode): SentencePair[] {
  const stamp = Math.random().toString(36).slice(2, 7)
  return splitSentences(source).map((seg, i) => ({
    id: `gen-${stamp}-${i + 1}`,
    source: seg.text,
    target: memory[seg.text] ?? `[${languageName(target)}] ${seg.text}`,
    trailing: seg.trailing,
    edited: false,
  }))
}

export interface GeneratedCard {
  term: string
  translation: string
  definition: string
  example: string
  exampleTranslation: string
}

export function generateCard(term: string, from: LanguageCode, to: LanguageCode, context: string, sentence = ''): GeneratedCard {
  const key = term.trim().toLowerCase()
  const candidates = cardGlossary.filter((e) => e.term === key && e.from === from && e.to === to)
  // The containing sentence decides the sense first; neighbouring sentences break ties.
  const match =
    candidates.find((e) => e.contextHint && new RegExp(e.contextHint, 'i').test(sentence)) ??
    candidates.find((e) => e.contextHint && new RegExp(e.contextHint, 'i').test(context)) ??
    candidates.find((e) => !e.contextHint) ??
    candidates[0]
  if (match) {
    return {
      term: term.trim(),
      translation: match.translation,
      definition: match.definition,
      example: match.example,
      exampleTranslation: match.exampleTranslation,
    }
  }
  return {
    term: term.trim(),
    translation: `${term.trim()} (${languageName(to)})`,
    definition: `Meaning of “${term.trim()}” as used in this passage.`,
    example: context.split(/(?<=[.!?])\s/)[0] ?? context,
    exampleTranslation: `Example translated into ${languageName(to)}.`,
  }
}
