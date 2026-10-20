import type { Block } from '../types/tutor';
import type { DocMeta, Reference, Suggestion } from '../types/document';

export const DOC_TITLE = 'Почему ser и estar меняют смысл';

export const TARGET_SENTENCE = 'Я постоянно пишу está для событий, потому что это ощущается как место.';
export const GUESS_SENTENCE = 'Моя догадка: estar обозначает результат изменения, а не временное состояние.';
export const CHECK_SENTENCE = 'Mi examen está el viernes en el aula tres.';

export const savedDocHtml = `
<h2>Коротко</h2>
<p>Оба глагола переводятся как <em>«быть»</em>, но отвечают на разные вопросы. <strong>Ser</strong> описывает, <em>что</em> представляет собой предмет: личность, происхождение, характеристики. <strong>Estar</strong> описывает, <em>в каком он состоянии сейчас</em>: состояния, местонахождение и результат изменения.</p>
<blockquote><p>«Ser es lo que eres; estar es cómo estás». — фраза, которую преподаватель повторяет каждый четверг</p></blockquote>
<h2>Прилагательные, которые меняют смысл</h2>
<p>Некоторые прилагательные полностью меняют значение в зависимости от глагола. Именно здесь я ошибаюсь чаще всего.</p>
<table><tbody><tr><th>Прилагательное</th><th>С ser</th><th>С estar</th></tr><tr><td>listo</td><td>умный</td><td>готовый</td></tr><tr><td>aburrido</td><td>скучный</td><td>скучающий</td></tr><tr><td>rico</td><td>богатый</td><td>вкусный</td></tr><tr><td>malo</td><td>плохой (характер)</td><td>больной</td></tr></tbody></table>
<h2>Примеры с занятий</h2>
<ul><li><strong>Mi hermano es listo.</strong> — Мой брат умный.</li><li><strong>¿Estás listo?</strong> — Ты готов?</li><li><strong>La película es aburrida.</strong> — Фильм скучный.</li><li><strong>Estoy aburrida.</strong> — Мне скучно.</li></ul>
<h2>Где я ещё сомневаюсь</h2>
<p>Место события выражается через ser, хотя местонахождение предметов — через estar. La fiesta es en mi casa, но las llaves están en la mesa. ${TARGET_SENTENCE}</p>
<p>Ещё один сложный случай — смерть: мы говорим <em>está muerto</em>, хотя смерть необратима. ${GUESS_SENTENCE}</p>
`;

export const workingAdditionHtml = `
<h2>Тренировочные предложения</h2>
<ol><li>El concierto ___ en el teatro municipal.</li><li>Esta sopa ___ muy rica.</li><li>Mi abuela ___ de Sevilla, pero ahora ___ en Madrid.</li></ol>
<h2>Мои предложения на проверку</h2>
<p>${CHECK_SENTENCE} Estoy muy aburrido con esta lista de verbos, pero la profesora es contenta con mi progreso.</p>
<h2>Что дальше</h2>
<p>Написать десять предложений о своей неделе с обоими глаголами и попросить репетитора проверить только те, где я сомневался. Повторить таблицу прилагательных до четверга.</p>
`;

export const workingDocHtml = savedDocHtml + workingAdditionHtml;

export const otherDeviceHtml =
  savedDocHtml.replace(TARGET_SENTENCE, `${TARGET_SENTENCE.slice(0, -1)} — репетитор посоветовал думать «проходит».`) +
  `
<h2>Тренировочные предложения</h2>
<ol><li>El concierto ___ en el teatro municipal.</li><li>La reunión ___ a las cinco.</li></ol>
<p>Добавлено в поезде: послушать <em>estar</em> + герундий в подкасте на этой неделе.</p>
`;

export const filledMeta: DocMeta = {
  summary: 'Когда нужен ser, а когда estar, прилагательные с двумя значениями и случаи, где я всё ещё ошибаюсь.',
  categories: ['Грамматика', 'Употребление и регистр'],
  studiedLanguage: 'Испанский',
  explanationLanguage: 'Русский',
};

export const emptyMeta: DocMeta = {
  summary: '',
  categories: [],
  studiedLanguage: '',
  explanationLanguage: '',
};

export const metaCategories = [
  'Грамматика',
  'Лексика и значения',
  'Употребление и регистр',
  'Произношение',
  'Этимология',
  'Культура',
  'Советы по изучению',
];

export const metaLanguages = ['Испанский', 'Русский', 'Английский', 'Французский', 'Немецкий', 'Итальянский', 'Португальский', 'Японский'];

export const copiedReferences: Reference[] = [
  {
    id: 'ref-class',
    title: 'Конспект занятия — 12 мая',
    excerpt: 'Estar + participio описывает результат: la puerta está cerrada…',
    text: 'Estar + participio описывает результат: la puerta está cerrada, la tienda está abierta, el trabajo está terminado. Ser + participio образует страдательный залог: la puerta fue cerrada por el portero. В речи пассив с ser редок — чаще говорят se + глагол.',
  },
  {
    id: 'ref-podcast',
    title: 'Расшифровка подкаста, эп. 41',
    excerpt: '—¿Cómo es tu nueva jefa? —Es muy simpática, pero hoy está de mal humor…',
    text: '—¿Cómo es tu nueva jefa? —Es muy simpática, pero hoy está de mal humor porque el proyecto está retrasado. —¿Y dónde es la reunión? —Es en la sala grande, la que está al lado de la cafetería.',
  },
  {
    id: 'ref-grammar',
    title: 'Учебник грамматики, гл. 7 (длинный отрывок)',
    excerpt: 'Глава 7 подробно разбирает связочные глаголы в романских языках…',
    text: 'Глава 7 подробно разбирает связочные глаголы в романских языках. '.repeat(380),
  },
];

export interface TutorScript {
  blocks: Block[];
  suggestion?: Suggestion;
}

export type ScriptKey = 'events' | 'death' | 'generic' | 'practice' | 'summary' | 'outline' | 'contrast' | 'check';

export const tutorScripts: Record<ScriptKey, TutorScript> = {
  events: {
    blocks: [
      { type: 'p', text: 'Хороший вопрос. С событиями используется **ser**, потому что они *происходят*, а не просто где-то находятся.' },
      { type: 'example', source: 'La fiesta **es** en mi casa.', translation: 'Вечеринка проходит у меня дома.', lang: 'es' },
      { type: 'example', source: 'Las llaves **están** en la mesa.', translation: 'Ключи лежат на столе.', lang: 'es' },
      { type: 'p', text: 'Простая проверка: если можно сказать *«проходит»*, нужен **ser**.' },
    ],
    suggestion: {
      label: 'Подсказка для заметки',
      inlineText: 'События «проходят», поэтому с ними нужен ser.',
      inlineHtml: 'События «проходят», поэтому с ними нужен <strong>ser</strong>.',
      blockHtml:
        '<p><strong>Подсказка:</strong> события <em>происходят</em>, поэтому с ними нужен ser (<em>La reunión es a las cinco en la oficina</em>), а местонахождение предметов и людей — через estar.</p>',
    },
  },
  death: {
    blocks: [
      { type: 'p', text: 'Ваша догадка верна. **Estar muerto** описывает *результат* изменения, а не то, как долго длится состояние.' },
      { type: 'example', source: 'Mi abuelo **está** muerto.', translation: 'Мой дедушка умер.', lang: 'es' },
      { type: 'p', text: 'Та же логика у *estar casado* и *estar roto*: это состояния после изменения.' },
    ],
    suggestion: {
      label: 'Уточнённое объяснение',
      inlineText: 'Estar обозначает результат изменения — muerto, casado, roto, — а не длительность состояния.',
      inlineHtml: 'Estar обозначает <em>результат изменения</em> — muerto, casado, roto, — а не длительность состояния.',
      blockHtml: '<p>Estar обозначает <em>результат изменения</em> — <em>muerto, casado, roto</em>, — а не длительность состояния.</p>',
    },
  },
  generic: {
    blocks: [
      {
        type: 'p',
        text: 'Фрагмент понятный. Стоит явно сформулировать: *что представляет собой* предмет (ser) и *в каком он состоянии сейчас* (estar) — так правило будет проще применять.',
      },
      { type: 'p', text: 'Можно добавить к фрагменту короткую проверку.' },
    ],
    suggestion: {
      label: 'Проверка в одну строку',
      inlineText: 'Проверка: что это такое → ser; какое оно сейчас → estar.',
      inlineHtml: '<strong>Проверка:</strong> что это <em>такое</em> → ser; какое оно <em>сейчас</em> → estar.',
      blockHtml: '<p><strong>Проверка:</strong> что это <em>такое</em> → ser; какое оно <em>сейчас</em> → estar.</p>',
    },
  },
  practice: {
    blocks: [
      { type: 'p', text: 'Вот три предложения на случаи, где вы сомневаетесь: события, результат изменения и прилагательные с двумя значениями.' },
      { type: 'ol', items: ['La boda ___ en la playa.', 'La ventana ___ rota desde ayer.', 'Ese chico ___ muy listo, pero hoy no ___ listo para el examen.'] },
      { type: 'p', text: 'Ответы: *es*, *está*, *es / está*.' },
    ],
    suggestion: {
      label: 'Три тренировочных предложения',
      inlineText: 'La boda ___ en la playa. La ventana ___ rota desde ayer.',
      inlineHtml: 'La boda ___ en la playa. La ventana ___ rota desde ayer.',
      blockHtml:
        '<ol><li>La boda ___ en la playa.</li><li>La ventana ___ rota desde ayer.</li><li>Ese chico ___ muy listo, pero hoy no ___ listo para el examen.</li></ol>',
    },
  },
  summary: {
    blocks: [
      {
        type: 'p',
        text: 'Заметка хорошо раскрывает основное различие и сложные случаи. Короткий итог в конце поможет быстрее повторять перед занятием.',
      },
    ],
    suggestion: {
      label: 'Итог',
      inlineText: 'Итог: ser — личность и события, estar — состояния и результат.',
      inlineHtml: 'Итог: <strong>ser</strong> — личность и события, <strong>estar</strong> — состояния и результат.',
      blockHtml:
        '<h2>Итог</h2><p><strong>Ser</strong> — личность, происхождение и события; <strong>estar</strong> — состояния, местонахождение предметов и результат изменения.</p>',
    },
  },
  outline: {
    blocks: [
      { type: 'p', text: 'Вот структура, с которой удобно начать. Её можно добавить в документ и заполнять по ходу.' },
      {
        type: 'ol',
        items: [
          '**Коротко** — правило в одном-двух предложениях',
          '**Примеры с занятий** — с переводом',
          '**Исключения и сложные случаи**',
          '**Мои ошибки** — что проверить в следующий раз',
          '**Тренировка** — 3–5 предложений',
        ],
      },
    ],
    suggestion: {
      label: 'Структура заметки',
      inlineText: 'Коротко · Примеры с занятий · Исключения · Мои ошибки · Тренировка',
      inlineHtml: 'Коротко · Примеры с занятий · Исключения · Мои ошибки · Тренировка',
      blockHtml:
        '<h2>Коротко</h2><p><br></p><h2>Примеры с занятий</h2><ul><li><br></li></ul><h2>Исключения и сложные случаи</h2><p><br></p><h2>Мои ошибки</h2><p><br></p><h2>Тренировка</h2><ol><li><br></li></ol>',
    },
  },
  contrast: {
    blocks: [
      { type: 'p', text: 'Если совсем просто: **ser** отвечает на вопрос «*что это?*», а **estar** — «*какое оно сейчас?*».' },
      { type: 'example', source: 'Juan **es** alegre.', translation: 'Хуан — весёлый человек.', lang: 'es' },
      { type: 'example', source: 'Juan **está** alegre.', translation: 'Хуан сейчас весёлый.', lang: 'es' },
      { type: 'p', text: 'Первое — черта характера, второе — настроение в моменте. Поэтому *listo*, *aburrido* и *rico* меняют смысл: меняется сам вопрос.' },
    ],
    suggestion: {
      label: 'Правило простыми словами',
      inlineText: 'Если совсем просто: ser — «что это?», estar — «какое оно сейчас?».',
      inlineHtml: '<strong>Если совсем просто:</strong> ser — «что это?», estar — «какое оно сейчас?».',
      blockHtml:
        '<p><strong>Если совсем просто:</strong> ser — «что это?», estar — «какое оно сейчас?» (<em>Juan es alegre</em> / <em>Juan está alegre</em>).</p>',
    },
  },
  check: {
    blocks: [
      { type: 'p', text: 'В разделе «Мои предложения на проверку» три ошибки:' },
      {
        type: 'ul',
        items: [
          '*está el viernes* → **es el viernes** — экзамен это событие.',
          '*aburrido con* → **aburrido de** — так говорят о том, что надоело.',
          '*es contenta* → **está contenta** — довольство это состояние.',
        ],
      },
      { type: 'p', text: 'Выделите предложение и нажмите «Исправить», чтобы увидеть правку прямо в тексте.' },
    ],
    suggestion: {
      label: 'Исправленный абзац',
      inlineText: 'Mi examen es el viernes en el aula tres. Estoy muy aburrido de esta lista de verbos, pero la profesora está contenta con mi progreso.',
      inlineHtml: 'Mi examen es el viernes en el aula tres. Estoy muy aburrido de esta lista de verbos, pero la profesora está contenta con mi progreso.',
      blockHtml:
        '<p>Mi examen es el viernes en el aula tres. Estoy muy aburrido de esta lista de verbos, pero la profesora está contenta con mi progreso.</p>',
    },
  },
};

/** Grammar fixes the prototype tutor recognises in selected Spanish text. */
export const corrections = [
  { find: 'está el viernes', replace: 'es el viernes', why: 'экзамен — событие, поэтому **es**.' },
  { find: 'aburrido con', replace: 'aburrido de', why: 'о том, что надоело, говорят **aburrido de**.' },
  { find: 'es contenta', replace: 'está contenta', why: '*contento* — состояние, поэтому **está**.' },
];

/** Simplified / rephrased versions of sentences in the demo document. */
export const rewrites = [
  {
    sentence: TARGET_SENTENCE,
    simplify: 'Для событий я часто ошибочно пишу está, а нужно es.',
    rephrase: 'Раньше я писал está для событий, но события «проходят», поэтому с ними нужен ser.',
  },
  {
    sentence: GUESS_SENTENCE,
    simplify: 'Estar здесь — результат изменения, а не временное состояние.',
    rephrase: 'Похоже, estar описывает не временность, а результат изменения.',
  },
  {
    sentence: 'Некоторые прилагательные полностью меняют значение в зависимости от глагола.',
    simplify: 'С ser и estar некоторые прилагательные значат разное.',
    rephrase: 'Смысл некоторых прилагательных целиком зависит от того, стоит рядом ser или estar.',
  },
];

/** Translations for the Spanish sentences in the demo document. */
export const translations = [
  { es: 'Ser es lo que eres; estar es cómo estás', ru: 'Ser — то, кто ты есть; estar — то, как ты сейчас' },
  { es: 'La fiesta es en mi casa', ru: 'Вечеринка проходит у меня дома' },
  { es: 'las llaves están en la mesa', ru: 'ключи лежат на столе' },
  { es: 'Mi hermano es listo', ru: 'Мой брат умный' },
  { es: '¿Estás listo?', ru: 'Ты готов?' },
  { es: 'La película es aburrida', ru: 'Фильм скучный' },
  { es: 'Estoy aburrida', ru: 'Мне скучно' },
  { es: 'está muerto', ru: 'он умер (букв. «находится мёртвым»)' },
  { es: 'El concierto ___ en el teatro municipal', ru: 'Концерт ___ в городском театре' },
  { es: 'Esta sopa ___ muy rica', ru: 'Этот суп ___ очень вкусный' },
  { es: 'Mi abuela ___ de Sevilla, pero ahora ___ en Madrid', ru: 'Моя бабушка ___ из Севильи, но сейчас ___ в Мадриде' },
  { es: 'Mi examen está el viernes en el aula tres', ru: 'Мой экзамен в пятницу в аудитории три' },
  { es: 'Estoy muy aburrido con esta lista de verbos', ru: 'Мне очень надоел этот список глаголов' },
  { es: 'la profesora es contenta con mi progreso', ru: 'преподавательница довольна моим прогрессом' },
];

