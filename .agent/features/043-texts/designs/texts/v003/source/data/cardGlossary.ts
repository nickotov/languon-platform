import type { LanguageCode } from '../types/texts'

export interface GlossaryEntry {
  term: string
  from: LanguageCode
  to: LanguageCode
  /** Regex source tested against the sentence + neighbours to pick the sense used here. */
  contextHint?: string
  translation: string
  definition: string
  example: string
  exampleTranslation: string
}

/** Simulated AI card generation. The real app generates these from passage context. */
export const cardGlossary: GlossaryEntry[] = [
  {
    term: 'bank', from: 'en', to: 'es', contextHint: 'river|water|tagus|sat on the bank',
    translation: 'orilla',
    definition: 'The land along the edge of a river or lake.',
    example: 'We had lunch on the bank of the river.',
    exampleTranslation: 'Almorzamos en la orilla del río.',
  },
  {
    term: 'bank', from: 'en', to: 'es', contextHint: 'cash|money|account',
    translation: 'banco',
    definition: 'A business where people keep, borrow and exchange money.',
    example: 'I need to stop at the bank before it closes.',
    exampleTranslation: 'Tengo que pasar por el banco antes de que cierre.',
  },
  {
    term: 'orilla', from: 'es', to: 'en',
    translation: 'bank (of a river)',
    definition: 'Franja de tierra que está junto al agua de un río, lago o mar.',
    example: 'Nos sentamos en la orilla a ver pasar los barcos.',
    exampleTranslation: 'We sat on the bank to watch the boats go by.',
  },
  {
    term: 'banco', from: 'es', to: 'en', contextHint: 'sentado|anciano|palomas',
    translation: 'bench',
    definition: 'Asiento largo, a menudo en un parque, donde caben varias personas.',
    example: 'Hay un banco libre a la sombra.',
    exampleTranslation: 'There is a free bench in the shade.',
  },
  {
    term: 'banco', from: 'es', to: 'en', contextHint: 'efectivo|dinero',
    translation: 'bank',
    definition: 'Empresa que guarda, presta y cambia dinero.',
    example: 'El banco abre a las nueve.',
    exampleTranslation: 'The bank opens at nine.',
  },
  {
    term: 'river', from: 'en', to: 'es',
    translation: 'río',
    definition: 'A large natural stream of water flowing to the sea or a lake.',
    example: 'The river runs through the old town.',
    exampleTranslation: 'El río atraviesa el casco antiguo.',
  },
  {
    term: 'light', from: 'en', to: 'es',
    translation: 'luz',
    definition: 'The natural brightness from the sun that makes things visible.',
    example: 'The morning light came through the window.',
    exampleTranslation: 'La luz de la mañana entraba por la ventana.',
  },
  {
    term: 'quiet', from: 'en', to: 'es',
    translation: 'tranquilo/a',
    definition: 'Calm and making little or no noise.',
    example: 'The streets were quiet after midnight.',
    exampleTranslation: 'Las calles estaban tranquilas después de medianoche.',
  },
  {
    term: 'opened her book', from: 'en', to: 'es',
    translation: 'abrió su libro',
    definition: 'Started reading by opening the book (third person, past).',
    example: 'She opened her book on the train.',
    exampleTranslation: 'Abrió su libro en el tren.',
  },
  {
    term: 'shutters', from: 'en', to: 'es',
    translation: 'persianas',
    definition: 'Hinged or rolling covers for a window or shop front.',
    example: 'The shutters were still closed at eight.',
    exampleTranslation: 'Las persianas seguían cerradas a las ocho.',
  },
]
