import type { LanguageCode, SentencePair, TextDoc, TextStatus } from '../types/texts'

type Row = [source: string, target: string, trailing: string, edited?: boolean]

function pairs(prefix: string, rows: Row[]): SentencePair[] {
  return rows.map(([source, target, trailing, edited], i) => ({
    id: `${prefix}-p${i + 1}`,
    source,
    target,
    trailing,
    edited: Boolean(edited),
  }))
}

function doc(
  id: string,
  folderId: string,
  title: string,
  sourceLang: LanguageCode,
  targetLang: LanguageCode,
  status: TextStatus,
  rows: Row[],
  extra: Partial<TextDoc> = {},
): TextDoc {
  const p = pairs(id, rows)
  return {
    id,
    folderId,
    title,
    sourceLang,
    targetLang,
    status,
    pairs: p,
    draftSource: p.map((x) => x.source + x.trailing).join('').trimEnd(),
    archived: false,
    updatedAt: '2026-10-13T09:00:00Z',
    version: 1,
    shareToken: null,
    ...extra,
  }
}

export const riverRows: Row[] = [
  ['We walked along the river.', 'Caminamos junto al río.', ' '],
  ['She sat on the bank and opened her book.', 'Se sentó en la orilla y abrió su libro.', ' '],
  ['The water was quiet.', 'El agua estaba tranquila.', ''],
]

export const lisbonRows: Row[] = [
  ['The city woke up slowly.', 'La ciudad despertó despacio.', ' '],
  [
    'Trams climbed the narrow streets while shop owners lifted their metal shutters, one by one, as if they were opening tired eyes.',
    'Los tranvías subían por las calles estrechas mientras los comerciantes levantaban sus persianas metálicas, una a una, como si abrieran unos ojos cansados.',
    ' ',
  ],
  ['I bought a coffee at the corner.', 'Compré un café en la esquina.', '\n\n'],
  [
    'The light in Lisbon is famous, and that morning I understood why.',
    'La luz de Lisboa es famosa. Aquella mañana entendí por qué.',
    ' ',
  ],
  [
    'It fell on the yellow walls and turned the river into a sheet of silver.',
    'Caía sobre las paredes amarillas y convertía el río en una lámina de plata.',
    ' ',
  ],
  [
    'An old man sat on a bench near the water, feeding pigeons with the patience of someone who had nowhere else to be.',
    'Un anciano estaba sentado en un banco cerca del agua, dando de comer a las palomas con la paciencia de quien no tenía otro lugar adonde ir.',
    ' ',
  ],
  [
    '“Every morning,” he told me, “the light is a little different.”',
    '«Cada mañana», me dijo, «la luz es un poco distinta».',
    '\n\n',
  ],
  [
    'I walked down to the bank of the Tagus and watched the ferries cross.',
    'Bajé hasta la orilla del Tajo y observé cómo cruzaban los ferris.',
    ' ',
  ],
  [
    'Later, I needed cash, so I looked for a bank in Baixa.',
    'Más tarde necesité efectivo, así que busqué un banco en la Baixa.',
    ' ',
  ],
  [
    'By noon the streets were full, and the quiet morning felt like a secret only I had seen.',
    'Al mediodía las calles estaban llenas, y la mañana tranquila parecía un secreto que solo yo había visto.',
    '',
  ],
]

const trainRows: Row[] = [
  ['The night train left Lisbon a few minutes late.', 'El tren nocturno salió de Lisboa con unos minutos de retraso.', ' '],
  ['Our compartment smelled of oranges and old leather.', 'Nuestro compartimento olía a naranjas y a cuero viejo.', ' '],
  ['A conductor checked our tickets and wished us a good trip.', 'Un revisor nos pidió los billetes y nos deseó buen viaje.', ' ', true],
  ['I fell asleep somewhere after Coimbra.', 'Me quedé dormido en algún punto después de Coímbra.', ''],
]

const cafeRows: Row[] = [
  ['Le petit café ouvre à sept heures.', 'The little café opens at seven.', ' '],
  ['Le patron connaît tous ses clients par leur prénom.', 'The owner knows all his customers by their first name.', ' '],
  ['Le matin, on y entend surtout le bruit des tasses.', 'In the morning, you mostly hear the sound of cups.', ''],
]

const classRows: Row[] = [
  ['Today we learned how to order food.', 'Hoy aprendimos a pedir comida.', ' '],
  ['The teacher spoke slowly.', 'La profesora habló despacio.', ''],
]

export const seedTexts: TextDoc[] = [
  doc('t-river', 'seed-daily', 'By the river', 'en', 'es', 'translated', riverRows, { updatedAt: '2026-10-14T08:12:00Z' }),
  doc('t-cafe', 'seed-daily', 'Le petit café', 'fr', 'en', 'translated', cafeRows, { updatedAt: '2026-10-10T07:30:00Z' }),
  {
    ...doc('t-market', 'seed-daily', 'Market notes', 'en', 'es', 'draft', [], { updatedAt: '2026-10-13T18:05:00Z' }),
    draftSource:
      'Tomatoes were cheaper than last week. The fish seller remembered my name.\n\nI forgot to buy bread again.',
  },
  doc(
    't-class',
    'seed-daily',
    'Notes from my first Spanish class — vocabulary I want to review before the weekend trip to Valencia with the whole group',
    'en',
    'es',
    'translated',
    classRows,
    { archived: true, updatedAt: '2026-09-01T12:00:00Z' },
  ),
  doc('t-lisbon', 'seed-travel', 'A morning in Lisbon', 'en', 'es', 'translated', lisbonRows, {
    updatedAt: '2026-10-12T17:40:00Z',
    shareToken: 'lisbon-7hq2',
  }),
  doc('t-train', 'seed-travel', 'The night train to Porto', 'en', 'es', 'edited', trainRows, {
    updatedAt: '2026-10-11T21:15:00Z',
    version: 3,
  }),
]
