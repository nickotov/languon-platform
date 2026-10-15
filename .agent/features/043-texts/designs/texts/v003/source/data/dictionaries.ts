import type { Card, Dictionary } from '../types/texts'

export const seedDictionaries: Dictionary[] = [
  { id: 'd-daily', name: 'Daily reading', sourceLang: 'en', targetLang: 'es', hiddenFields: [] },
  {
    id: 'd-travel',
    name: 'Travel Spanish — phrases I keep hearing on buses, trains and ferries',
    sourceLang: 'en',
    targetLang: 'es',
    hiddenFields: ['example'],
  },
  { id: 'd-kitchen', name: 'Kitchen & food', sourceLang: 'en', targetLang: 'es', hiddenFields: [] },
  { id: 'd-work', name: 'Work emails', sourceLang: 'en', targetLang: 'es', hiddenFields: ['definition'] },
  { id: 'd-lisbon', name: 'Lisbon trip', sourceLang: 'en', targetLang: 'es', hiddenFields: [] },
  { id: 'd-phrasal', name: 'Phrasal verbs', sourceLang: 'en', targetLang: 'es', hiddenFields: [] },
  { id: 'd-es-en', name: 'Spanish → English reading', sourceLang: 'es', targetLang: 'en', hiddenFields: [] },
  { id: 'd-fr', name: 'French basics', sourceLang: 'fr', targetLang: 'en', hiddenFields: [] },
]

export const seedCards: Card[] = [
  {
    id: 'c-river', dictionaryId: 'd-daily', term: 'river', translation: 'río',
    definition: 'A large natural stream of water flowing to the sea or a lake.',
    example: 'The river runs through the old town.', exampleTranslation: 'El río atraviesa el casco antiguo.',
    context: 'We walked along the river.', createdAt: '2026-10-01T09:00:00Z',
  },
  {
    id: 'c-book', dictionaryId: 'd-daily', term: 'book', translation: 'libro',
    definition: 'A set of printed pages bound together to be read.',
    example: 'I left my book on the train.', exampleTranslation: 'Dejé mi libro en el tren.',
    context: '', createdAt: '2026-09-28T09:00:00Z',
  },
  {
    id: 'c-water', dictionaryId: 'd-daily', term: 'water', translation: 'agua',
    definition: 'The clear liquid in rivers, lakes and rain.',
    example: 'Can I have a glass of water?', exampleTranslation: '¿Me pones un vaso de agua?',
    context: '', createdAt: '2026-09-20T09:00:00Z',
  },
  {
    id: 'c-ticket', dictionaryId: 'd-travel', term: 'ticket', translation: 'billete',
    definition: 'A piece of paper or digital pass that lets you travel.',
    example: 'Keep your ticket until the end of the trip.', exampleTranslation: 'Guarda tu billete hasta el final del viaje.',
    context: '', createdAt: '2026-09-10T09:00:00Z',
  },
  {
    id: 'c-tranquilo', dictionaryId: 'd-es-en', term: 'tranquilo', translation: 'calm, quiet',
    definition: 'Sin agitación ni ruido.', example: 'Es un barrio muy tranquilo.', exampleTranslation: 'It is a very quiet neighbourhood.',
    context: '', createdAt: '2026-09-05T09:00:00Z',
  },
]
