import type {
    ExerciseActivityId,
    ExerciseActivityMetadata,
} from './exercise-activity';

/** Examples illustrate the interaction in English; generation selects its own language. */
export const exerciseActivityLocales = {
    V01: {
        en: {
            name: 'Recall the word',
            description:
                'Type the word that matches a meaning or contextual clue.',
            example: 'A place where you can borrow books: ____.',
        },
        ru: {
            name: 'Вспомните слово',
            description: 'Введите слово по значению или подсказке в контексте.',
            example: 'Место, где можно брать книги: ____.',
        },
        fr: {
            name: 'Retrouvez le mot',
            description:
                'Écrivez le mot correspondant au sens ou à un indice en contexte.',
            example: 'Un lieu où emprunter des livres : ____.',
        },
        es: {
            name: 'Recuerda la palabra',
            description:
                'Escribe la palabra que corresponde al significado o a una pista en contexto.',
            example: 'Un lugar donde puedes tomar libros prestados: ____.',
        },
    },
    V02: {
        en: {
            name: 'Choose the meaning',
            description:
                'Choose the meaning of a word as it is used in a sentence.',
            example:
                'In “The room was bright,” does “bright” mean full of light or clever?',
        },
        ru: {
            name: 'Выберите значение',
            description: 'Выберите значение слова в предложении.',
            example:
                'В “The room was bright” слово “bright” означает «светлый» или «умный»?',
        },
        fr: {
            name: 'Choisissez le sens',
            description: 'Choisissez le sens du mot dans la phrase.',
            example:
                'Dans « The room was bright », « bright » signifie-t-il lumineux ou intelligent ?',
        },
        es: {
            name: 'Elige el significado',
            description: 'Elige el significado de una palabra en la oración.',
            example:
                'En «The room was bright», ¿«bright» significa luminoso o inteligente?',
        },
    },
    V03: {
        en: {
            name: 'Complete the sentence',
            description:
                'Fill a sentence gap with a word that fits its meaning.',
            example: 'Use “borrow”: Can I ____ your pen?',
        },
        ru: {
            name: 'Дополните предложение',
            description: 'Вставьте слово, подходящее по смыслу предложения.',
            example: 'Используйте “borrow”: Can I ____ your pen?',
        },
        fr: {
            name: 'Complétez la phrase',
            description: 'Complétez une phrase avec un mot adapté au sens.',
            example: 'Utilisez « borrow » : Can I ____ your pen?',
        },
        es: {
            name: 'Completa la oración',
            description:
                'Completa el espacio con una palabra que encaje con el significado.',
            example: 'Usa «borrow»: Can I ____ your pen?',
        },
    },
    V05: {
        en: {
            name: 'Build natural word pairs',
            description: 'Complete common word combinations in context.',
            example: 'Use “make” or “do”: We need to ____ a decision.',
        },
        ru: {
            name: 'Составьте естественные сочетания',
            description: 'Дополните устойчивые сочетания слов в контексте.',
            example: 'Используйте “make” или “do”: We need to ____ a decision.',
        },
        fr: {
            name: 'Formez des associations naturelles',
            description:
                'Complétez des associations courantes de mots en contexte.',
            example:
                'Utilisez « make » ou « do » : We need to ____ a decision.',
        },
        es: {
            name: 'Forma combinaciones naturales',
            description:
                'Completa combinaciones habituales de palabras en contexto.',
            example: 'Usa «make» o «do»: We need to ____ a decision.',
        },
    },
    V06: {
        en: {
            name: 'Change the word form',
            description:
                'Use the required form of a word to complete a sentence.',
            example: 'Form an adjective from “care”: Be ____ with that glass.',
        },
        ru: {
            name: 'Измените форму слова',
            description: 'Дополните предложение нужной формой слова.',
            example:
                'Образуйте прилагательное от “care”: Be ____ with that glass.',
        },
        fr: {
            name: 'Changez la forme du mot',
            description: 'Complétez une phrase avec la forme demandée du mot.',
            example:
                'Formez un adjectif à partir de « care » : Be ____ with that glass.',
        },
        es: {
            name: 'Cambia la forma de la palabra',
            description:
                'Completa una oración con la forma requerida de la palabra.',
            example:
                'Forma un adjetivo a partir de «care»: Be ____ with that glass.',
        },
    },
    V07: {
        en: {
            name: 'Use these words',
            description:
                'Use selected words with their intended meanings in your own text.',
            example: 'Write a message about a trip using “delay” and “arrive”.',
        },
        ru: {
            name: 'Используйте эти слова',
            description:
                'Используйте выбранные слова в нужных значениях в своём тексте.',
            example:
                'Напишите сообщение о поездке со словами “delay” и “arrive”.',
        },
        fr: {
            name: 'Utilisez ces mots',
            description:
                'Utilisez les mots choisis dans leur sens attendu dans votre propre texte.',
            example:
                'Écrivez un message sur un voyage avec « delay » et « arrive ».',
        },
        es: {
            name: 'Usa estas palabras',
            description:
                'Usa las palabras seleccionadas con su significado previsto en tu propio texto.',
            example:
                'Escribe un mensaje sobre un viaje usando «delay» y «arrive».',
        },
    },
    G01: {
        en: {
            name: 'Choose the right form',
            description: 'Choose the grammatical form that fits the situation.',
            example: 'Yesterday she ____ home early: went / goes / will go.',
        },
        ru: {
            name: 'Выберите правильную форму',
            description:
                'Выберите грамматическую форму, подходящую к ситуации.',
            example: 'Yesterday she ____ home early: went / goes / will go.',
        },
        fr: {
            name: 'Choisissez la bonne forme',
            description:
                'Choisissez la forme grammaticale adaptée à la situation.',
            example: 'Yesterday she ____ home early: went / goes / will go.',
        },
        es: {
            name: 'Elige la forma correcta',
            description:
                'Elige la forma gramatical que encaje con la situación.',
            example: 'Yesterday she ____ home early: went / goes / will go.',
        },
    },
    G02: {
        en: {
            name: 'Complete the grammar',
            description:
                'Fill gaps using the specified grammar rule and context.',
            example:
                'Use the present perfect: She ____ (finish) her work already.',
        },
        ru: {
            name: 'Дополните грамматическую форму',
            description:
                'Заполните пропуски по заданному правилу с учётом контекста.',
            example:
                'Используйте present perfect: She ____ (finish) her work already.',
        },
        fr: {
            name: 'Complétez la forme grammaticale',
            description:
                'Complétez les blancs selon la règle indiquée et le contexte.',
            example:
                'Utilisez le present perfect : She ____ (finish) her work already.',
        },
        es: {
            name: 'Completa la forma gramatical',
            description:
                'Completa los espacios según la regla indicada y el contexto.',
            example:
                'Usa el present perfect: She ____ (finish) her work already.',
        },
    },
    G03: {
        en: {
            name: 'Rewrite with the target grammar',
            description:
                'Keep the meaning while rewriting with the required construction.',
            example: 'Use the passive: The chef prepared the meal.',
        },
        ru: {
            name: 'Перепишите с нужной грамматикой',
            description:
                'Перепишите предложение с заданной конструкцией, сохранив смысл.',
            example: 'Используйте пассивный залог: The chef prepared the meal.',
        },
        fr: {
            name: 'Reformulez avec la structure demandée',
            description:
                'Conservez le sens en reformulant avec la construction demandée.',
            example: 'Utilisez la voix passive : The chef prepared the meal.',
        },
        es: {
            name: 'Reescribe con la estructura indicada',
            description:
                'Mantén el significado al reescribir con la construcción requerida.',
            example: 'Usa la voz pasiva: The chef prepared the meal.',
        },
    },
    G04: {
        en: {
            name: 'Find and fix the error',
            description:
                'Correct a grammatical error while preserving the intended meaning.',
            example:
                'Correct the subject–verb agreement: She go to work by bus.',
        },
        ru: {
            name: 'Найдите и исправьте ошибку',
            description:
                'Исправьте грамматическую ошибку, сохранив исходный смысл.',
            example: 'Исправьте согласование: She go to work by bus.',
        },
        fr: {
            name: 'Trouvez et corrigez l’erreur',
            description:
                'Corrigez une erreur grammaticale en conservant le sens voulu.',
            example: 'Corrigez l’accord sujet-verbe : She go to work by bus.',
        },
        es: {
            name: 'Encuentra y corrige el error',
            description:
                'Corrige un error gramatical sin cambiar el significado previsto.',
            example: 'Corrige la concordancia: She go to work by bus.',
        },
    },
    G06: {
        en: {
            name: 'Choose what the sentence means',
            description:
                'Choose the meaning expressed by a grammatical construction.',
            example:
                '“You mustn’t enter” means it is forbidden or it is unnecessary?',
        },
        ru: {
            name: 'Выберите смысл предложения',
            description:
                'Выберите значение, которое передаёт грамматическая конструкция.',
            example:
                '“You mustn’t enter” означает «вход запрещён» или «входить необязательно»?',
        },
        fr: {
            name: 'Choisissez le sens de la phrase',
            description:
                'Choisissez le sens exprimé par une construction grammaticale.',
            example:
                '« You mustn’t enter » signifie-t-il que c’est interdit ou inutile ?',
        },
        es: {
            name: 'Elige el sentido de la oración',
            description:
                'Elige el significado que expresa una construcción gramatical.',
            example:
                '¿«You mustn’t enter» significa que está prohibido o que no es necesario?',
        },
    },
    G07: {
        en: {
            name: 'Say it for this situation',
            description:
                'Write a response that suits a situation and uses the target grammar.',
            example:
                'Use “could” to ask politely for directions to the station.',
        },
        ru: {
            name: 'Скажите это в данной ситуации',
            description:
                'Напишите ответ по ситуации, используя заданную грамматику.',
            example:
                'Используйте “could”, чтобы вежливо спросить дорогу к вокзалу.',
        },
        fr: {
            name: 'Exprimez-vous dans cette situation',
            description:
                'Écrivez une réponse adaptée à la situation avec la structure visée.',
            example:
                'Utilisez « could » pour demander poliment le chemin de la gare.',
        },
        es: {
            name: 'Exprésate en esta situación',
            description:
                'Escribe una respuesta adecuada a la situación con la gramática indicada.',
            example:
                'Usa «could» para preguntar amablemente cómo llegar a la estación.',
        },
    },
    R01: {
        en: {
            name: 'Find the main idea',
            description:
                'Choose the statement that best captures the passage’s main point.',
            example:
                'After reading a passage about cycling, choose its main message.',
        },
        ru: {
            name: 'Найдите главную мысль',
            description:
                'Выберите утверждение, которое лучше всего передаёт главную мысль текста.',
            example:
                'Прочитайте текст о велопоездках и выберите его главную мысль.',
        },
        fr: {
            name: 'Trouvez l’idée principale',
            description:
                'Choisissez l’affirmation qui résume le mieux l’idée principale du texte.',
            example:
                'Après un texte sur le vélo, choisissez son message principal.',
        },
        es: {
            name: 'Encuentra la idea principal',
            description:
                'Elige la afirmación que mejor expresa la idea principal del texto.',
            example:
                'Después de leer un texto sobre ciclismo, elige su mensaje principal.',
        },
    },
    R02: {
        en: {
            name: 'Find the details',
            description:
                'Choose an answer supported by a specific detail in the passage.',
            example: 'According to the passage, when did the train leave?',
        },
        ru: {
            name: 'Найдите детали',
            description:
                'Выберите ответ, подтверждённый конкретной деталью текста.',
            example: 'Согласно тексту, когда отправился поезд?',
        },
        fr: {
            name: 'Repérez les détails',
            description:
                'Choisissez une réponse appuyée par un détail précis du texte.',
            example: 'D’après le texte, quand le train est-il parti ?',
        },
        es: {
            name: 'Encuentra los detalles',
            description:
                'Elige una respuesta respaldada por un detalle concreto del texto.',
            example: 'Según el texto, ¿cuándo salió el tren?',
        },
    },
    R03: {
        en: {
            name: 'True, false or not stated',
            description:
                'Decide whether a claim agrees with the text, contradicts it, or is not stated.',
            example:
                'Text: “Mira took a train.” Claim: “Mira bought her ticket online.”',
        },
        ru: {
            name: 'Верно, неверно или не сказано',
            description:
                'Определите, подтверждается ли утверждение текстом, противоречит ему или не упоминается.',
            example:
                'Текст: «Мира поехала на поезде». Утверждение: «Мира купила билет онлайн».',
        },
        fr: {
            name: 'Vrai, faux ou non indiqué',
            description:
                'Distinguez une affirmation confirmée, contredite ou non indiquée par le texte.',
            example:
                'Texte : « Mira a pris le train. » Affirmation : « Elle a acheté son billet en ligne. »',
        },
        es: {
            name: 'Verdadero, falso o no se menciona',
            description:
                'Decide si una afirmación coincide con el texto, lo contradice o no se menciona.',
            example:
                'Texto: «Mira tomó un tren». Afirmación: «Mira compró su billete por internet».',
        },
    },
    R04: {
        en: {
            name: 'Answer in your own words',
            description:
                'Explain an answer using the passage and your own wording.',
            example:
                'Based on the passage, explain why Mira changed her travel plans.',
        },
        ru: {
            name: 'Ответьте своими словами',
            description: 'Ответьте своими словами, опираясь на текст.',
            example: 'По тексту объясните, почему Мира изменила планы поездки.',
        },
        fr: {
            name: 'Répondez avec vos propres mots',
            description:
                'Expliquez une réponse en vous appuyant sur le texte avec vos propres mots.',
            example:
                'D’après le texte, expliquez pourquoi Mira a changé ses projets de voyage.',
        },
        es: {
            name: 'Responde con tus propias palabras',
            description:
                'Explica una respuesta basándote en el texto y usando tus propias palabras.',
            example:
                'Según el texto, explica por qué Mira cambió sus planes de viaje.',
        },
    },
    R08: {
        en: {
            name: 'Complete the summary',
            description:
                'Fill gaps in a summary with information supported by the passage.',
            example:
                'Complete from the passage: Because the roads were ____, Mira took a train.',
        },
        ru: {
            name: 'Дополните краткое изложение',
            description:
                'Заполните пропуски в кратком изложении по информации из текста.',
            example:
                'Дополните по тексту: Because the roads were ____, Mira took a train.',
        },
        fr: {
            name: 'Complétez le résumé',
            description:
                'Complétez un résumé avec des informations appuyées par le texte.',
            example:
                'Complétez d’après le texte : Because the roads were ____, Mira took a train.',
        },
        es: {
            name: 'Completa el resumen',
            description:
                'Completa un resumen con información respaldada por el texto.',
            example:
                'Completa según el texto: Because the roads were ____, Mira took a train.',
        },
    },
    R09: {
        en: {
            name: 'Summarize the text',
            description:
                'Write a concise summary that preserves the passage’s main ideas.',
            example:
                'Summarize the passage in two sentences without adding new facts.',
        },
        ru: {
            name: 'Кратко изложите текст',
            description:
                'Напишите краткое изложение, сохранив главные мысли текста.',
            example:
                'Изложите текст в двух предложениях, не добавляя новых фактов.',
        },
        fr: {
            name: 'Résumez le texte',
            description:
                'Rédigez un résumé concis qui conserve les idées principales du texte.',
            example:
                'Résumez le texte en deux phrases sans ajouter de nouveaux faits.',
        },
        es: {
            name: 'Resume el texto',
            description:
                'Escribe un resumen breve que conserve las ideas principales del texto.',
            example:
                'Resume el texto en dos oraciones sin añadir hechos nuevos.',
        },
    },
    W01: {
        en: {
            name: 'Translate the meaning',
            description:
                'Translate a short text while preserving its meaning and intended tone.',
            example:
                'Translate “Could you give me a hand?” as a polite request for help.',
        },
        ru: {
            name: 'Переведите смысл',
            description: 'Переведите короткий текст, сохранив его смысл и тон.',
            example:
                'Переведите “Could you give me a hand?” как вежливую просьбу о помощи.',
        },
        fr: {
            name: 'Traduisez le sens',
            description:
                'Traduisez un court texte en préservant son sens et son ton.',
            example:
                'Traduisez « Could you give me a hand? » comme une demande d’aide polie.',
        },
        es: {
            name: 'Traduce el significado',
            description:
                'Traduce un texto breve conservando su significado y su tono.',
            example:
                'Traduce «Could you give me a hand?» como una petición amable de ayuda.',
        },
    },
} as const satisfies Record<
    ExerciseActivityId,
    ExerciseActivityMetadata['locales']
>;
