import type { ExerciseActivityId } from '@languon/contracts';
import type { Locale } from '@/fsd/shared/i18n';

/** Selection guidance explains when to request an activity, independently of its answer. */
const guidance: Record<ExerciseActivityId, [string, string, string, string]> = {
    L01: [
        'Use a short conversation to practise listening for purpose or detail. Listen once, choose a meaning, then replay the evidence.',
        'Возьмите короткий диалог, чтобы потренироваться понимать цель или детали разговора. Прослушайте его, выберите ответ и проверьте нужный фрагмент.',
        'Choisissez un court dialogue pour repérer une intention ou un détail. Écoutez, choisissez le sens puis réécoutez l’extrait.',
        'Elige un diálogo breve para identificar una intención o un detalle. Escucha, elige la respuesta y vuelve al fragmento.',
    ],
    L02: [
        'Choose dictation when learners need to hear word boundaries or spelling. Use a short, clearly audible utterance and write what the speaker says.',
        'Выберите диктант для тренировки правописания и восприятия границ слов на слух. Возьмите короткую, чёткую реплику и запишите её целиком.',
        'Choisissez la dictée pour travailler les limites entre les mots et l’orthographe. Écoutez une courte réplique et écrivez-la en entier.',
        'Elige el dictado para practicar la ortografía y distinguir las palabras al oírlas. Escucha una intervención breve y escríbela entera.',
    ],
    L04: [
        'Use a listening gap when a learner needs to pick out a specific detail in continuous speech. Leave enough context around the missing word.',
        'Используйте пропуски, чтобы учиться различать конкретные детали в потоке речи. Оставьте достаточно контекста до и после пропущенного слова.',
        'Utilisez un texte à trous pour repérer un détail précis dans une conversation. Gardez suffisamment de contexte autour du mot manquant.',
        'Usa un texto con huecos para identificar un detalle concreto en el habla continua. Deja suficiente contexto alrededor de la palabra que falta.',
    ],
    V01: [
        'Choose this to practise recalling a word without options. Supply vocabulary entries with clear meanings so the clue points to a specific word.',
        'Выберите этот тип для вспоминания слова без вариантов ответа. Нужны словарные записи с понятными значениями, чтобы подсказка указывала на конкретное слово.',
        'Choisissez cette activité pour retrouver un mot sans choix proposés. Fournissez des entrées de vocabulaire aux sens précis pour obtenir un indice sans ambiguïté.',
        'Elige esta actividad para recordar una palabra sin opciones. Aporta entradas de vocabulario con significados claros para que la pista señale una palabra concreta.',
    ],
    V02: [
        'Start here to recognise a word’s meaning before recalling it independently. Supply vocabulary with a clear sense; the choices should contrast meanings rather than be near synonyms.',
        'Начните с этого типа, чтобы узнавать значение слова перед самостоятельным вспоминанием. Нужны слова с ясными значениями; варианты должны различаться по смыслу, а не быть почти синонимами.',
        'Commencez ici pour reconnaître le sens avant de retrouver le mot seul. Fournissez un vocabulaire au sens clair ; les choix doivent distinguer des sens plutôt que des quasi-synonymes.',
        'Empieza aquí para reconocer el significado antes de recordar la palabra sin ayuda. Aporta vocabulario con un sentido claro; las opciones deben contrastar significados, no ser casi sinónimos.',
    ],
    V03: [
        'Use this to place a known word in context. Supply vocabulary with meanings or examples, and ask for a sentence that gives enough clues to complete the gap.',
        'Используйте этот тип для употребления знакомого слова в контексте. Нужны значения или примеры слов и предложение с достаточными подсказками для заполнения пропуска.',
        'Utilisez cette activité pour placer un mot connu en contexte. Fournissez les sens ou des exemples et demandez une phrase donnant assez d’indices pour compléter le blanc.',
        'Úsala para situar una palabra conocida en contexto. Aporta significados o ejemplos y pide una frase con suficientes pistas para completar el hueco.',
    ],
    V05: [
        'Choose this to learn which words naturally go together. Supply vocabulary containing useful phrases or collocation examples; isolated meanings alone may not support a clear word pair.',
        'Выберите этот тип для изучения естественных сочетаний слов. Нужны полезные выражения или примеры сочетаемости; одних отдельных значений может быть недостаточно.',
        'Choisissez cette activité pour apprendre les associations naturelles de mots. Fournissez des expressions ou des exemples de collocations ; des sens isolés peuvent être insuffisants.',
        'Elígela para aprender combinaciones naturales de palabras. Aporta expresiones o ejemplos de colocaciones; los significados aislados pueden no bastar.',
    ],
    V06: [
        'Use this to practise a word family or a change of word form. Supply vocabulary that supports the required form, and give a sentence whose grammar makes that form necessary.',
        'Используйте этот тип для тренировки семейства слов или изменения формы. В словаре должна быть нужная форма, а грамматика предложения должна требовать именно её.',
        'Utilisez cette activité pour travailler une famille de mots ou un changement de forme. Fournissez la forme nécessaire dans le vocabulaire et une phrase qui l’exige grammaticalement.',
        'Úsala para practicar una familia de palabras o un cambio de forma. Aporta vocabulario que incluya la forma necesaria y una frase cuya gramática la requiera.',
    ],
    V07: [
        'Choose this when you want to use several words in your own writing. Supply target vocabulary with clear senses and specify the situation, length and words to include.',
        'Выберите этот тип, чтобы использовать несколько слов в собственном тексте. Укажите слова с ясными значениями, ситуацию, объём и обязательные слова.',
        'Choisissez cette activité pour employer plusieurs mots dans votre propre texte. Fournissez les mots et leurs sens, puis précisez la situation, la longueur et les mots obligatoires.',
        'Elígela para usar varias palabras en un texto propio. Aporta las palabras y sus sentidos, y concreta la situación, la extensión y las palabras obligatorias.',
    ],
    G01: [
        'Choose this to recognise the correct grammar form in a clear context. Supply a grammar block with the target rule and ask for choices that test that rule.',
        'Выберите этот тип для узнавания правильной грамматической формы в ясном контексте. Добавьте грамматический блок с нужным правилом и попросите варианты, проверяющие его.',
        'Choisissez cette activité pour reconnaître la bonne forme dans un contexte clair. Fournissez un bloc de grammaire avec la règle cible et demandez des choix qui la testent.',
        'Elígela para reconocer la forma correcta en un contexto claro. Aporta un bloque de gramática con la regla y pide opciones que la evalúen.',
    ],
    G02: [
        'Use this to produce a grammar form without choosing from options. Supply the rule and enough context to make the intended tense or structure clear.',
        'Используйте этот тип для самостоятельного образования грамматической формы. Нужны правило и контекст, однозначно указывающий на нужное время или конструкцию.',
        'Utilisez cette activité pour produire une forme sans choix proposés. Fournissez la règle et un contexte qui indique clairement le temps ou la structure attendus.',
        'Úsala para producir una forma sin elegir entre opciones. Aporta la regla y contexto suficiente para aclarar el tiempo o la estructura que se pide.',
    ],
    G03: [
        'Choose this to practise transforming a sentence while keeping its intended meaning. Supply a grammar rule and state the target structure or changed situation explicitly.',
        'Выберите этот тип для преобразования предложения с сохранением нужного смысла. Добавьте правило и явно укажите целевую конструкцию или изменённую ситуацию.',
        'Choisissez cette activité pour transformer une phrase en conservant le sens voulu. Fournissez la règle et précisez la structure cible ou le changement de situation.',
        'Elígela para transformar una frase conservando el sentido deseado. Aporta la regla e indica la estructura objetivo o el cambio de situación.',
    ],
    G04: [
        'Use this to notice and repair a specific grammar mistake. Supply the target rule or common mistakes, and keep the sentence focused on one teachable error.',
        'Используйте этот тип для поиска и исправления конкретной грамматической ошибки. Нужны правило или типичные ошибки; лучше сосредоточить предложение на одной ошибке.',
        'Utilisez cette activité pour repérer et corriger une erreur précise. Fournissez la règle ou des erreurs fréquentes et concentrez la phrase sur une seule difficulté.',
        'Úsala para detectar y corregir un error gramatical concreto. Aporta la regla o errores habituales y centra la frase en un único error útil para aprender.',
    ],
    G06: [
        'Choose this when the form is familiar but its meaning is still confusing. Supply a grammar rule and a sentence whose interpretation depends on that rule.',
        'Выберите этот тип, если форма уже знакома, но её смысл ещё вызывает трудности. Нужны правило и предложение, понимание которого зависит от этого правила.',
        'Choisissez cette activité lorsque la forme est connue mais son sens reste difficile. Fournissez une règle et une phrase dont l’interprétation dépend de cette règle.',
        'Elígela cuando la forma resulte familiar pero su significado siga siendo confuso. Aporta una regla y una frase cuya interpretación dependa de ella.',
    ],
    G07: [
        'Use this to apply grammar in a short real-life situation. Supply the rule and specify who is speaking, the situation and which structures the response should demonstrate.',
        'Используйте этот тип для применения грамматики в жизненной ситуации. Добавьте правило и укажите говорящего, ситуацию и конструкции, которые нужно использовать.',
        'Utilisez cette activité pour appliquer la grammaire dans une situation concrète. Fournissez la règle, le locuteur, la situation et les structures à employer.',
        'Úsala para aplicar la gramática en una situación cotidiana. Aporta la regla e indica quién habla, la situación y las estructuras que debe demostrar la respuesta.',
    ],
    R01: [
        'Start here to check the overall message before looking at details. Supply a complete passage with a clear central topic, rather than unrelated isolated sentences.',
        'Начните с этого типа, чтобы проверить общий смысл перед деталями. Нужен связный текст с ясной основной темой, а не отдельные несвязанные предложения.',
        'Commencez ici pour vérifier le message global avant les détails. Fournissez un passage cohérent avec un thème central clair, plutôt que des phrases isolées sans lien.',
        'Empieza aquí para comprobar el mensaje global antes de los detalles. Aporta un texto coherente con un tema central claro, no frases aisladas sin relación.',
    ],
    R02: [
        'Use this to practise locating an explicit fact. Supply a passage containing the answer and ask about a detail that can be checked directly in the text.',
        'Используйте этот тип для поиска явно указанного факта. Ответ должен быть в исходном тексте; выбирайте деталь, которую можно проверить непосредственно.',
        'Utilisez cette activité pour retrouver un fait explicite. Fournissez un passage contenant la réponse et demandez un détail directement vérifiable dans le texte.',
        'Úsala para localizar un dato explícito. Aporta un texto que contenga la respuesta y pregunta por un detalle comprobable directamente.',
    ],
    R03: [
        'Choose this to distinguish supported facts, contradictions and missing information. Supply the full relevant passage; “not stated” needs genuinely absent evidence, not a guess about the world.',
        'Выберите этот тип, чтобы различать подтверждённые факты, противоречия и отсутствие информации. Нужен полный фрагмент; «не сказано» означает отсутствие сведений в тексте, а не догадку о мире.',
        'Choisissez cette activité pour distinguer faits confirmés, contradictions et informations absentes. Fournissez tout le passage utile ; « non indiqué » concerne l’absence de preuve dans le texte.',
        'Elígela para distinguir datos confirmados, contradicciones e información ausente. Aporta el pasaje completo pertinente; «no se indica» exige ausencia de pruebas en el texto.',
    ],
    R04: [
        'Use this to explain a passage in your own words. Supply a text with enough evidence for the question and specify the points the answer should cover.',
        'Используйте этот тип для объяснения текста своими словами. Нужны достаточные сведения в источнике и перечень вопросов, которые должен раскрыть ответ.',
        'Utilisez cette activité pour expliquer un passage avec vos propres mots. Fournissez assez d’éléments dans le texte et précisez les points à traiter.',
        'Úsala para explicar un texto con tus propias palabras. Aporta pruebas suficientes en la fuente e indica los puntos que debe cubrir la respuesta.',
    ],
    R08: [
        'Choose this to follow the main facts through a short guided summary. Supply the original passage and make each gap recoverable from its meaning or wording.',
        'Выберите этот тип для восстановления основных фактов в кратком резюме с подсказками. Нужен исходный текст; каждый пропуск должен восстанавливаться по его смыслу или словам.',
        'Choisissez cette activité pour suivre les faits essentiels dans un résumé guidé. Fournissez le passage original ; chaque blanc doit pouvoir être complété grâce à son sens ou ses mots.',
        'Elígela para seguir los datos principales en un resumen guiado. Aporta el texto original y haz que cada hueco pueda resolverse por su sentido o sus palabras.',
    ],
    R09: [
        'Use this to select essential information and leave out minor details. Supply a coherent passage and specify the summary length and facts that matter most.',
        'Используйте этот тип для отбора главной информации и исключения мелких деталей. Нужен связный текст; укажите объём резюме и важнейшие факты.',
        'Utilisez cette activité pour sélectionner l’essentiel et écarter les détails secondaires. Fournissez un passage cohérent et précisez la longueur du résumé et les faits prioritaires.',
        'Úsala para seleccionar lo esencial y omitir detalles secundarios. Aporta un texto coherente e indica la extensión del resumen y los datos más importantes.',
    ],
    W01: [
        'Choose this to express the source meaning in another language. Supply a short passage and name both languages explicitly; this example translates English into French.',
        'Выберите этот тип для передачи смысла на другом языке. Нужен короткий исходный фрагмент и явное указание обоих языков; здесь перевод с английского на французский.',
        'Choisissez cette activité pour exprimer le sens dans une autre langue. Fournissez un court passage et nommez les deux langues ; cet exemple traduit l’anglais vers le français.',
        'Elígela para expresar el sentido en otro idioma. Aporta un pasaje breve e indica ambos idiomas; este ejemplo traduce del inglés al francés.',
    ],
};

export function activityUseCaseGuidance(
    id: ExerciseActivityId,
    locale: Locale,
): string {
    const index = ['en', 'ru', 'fr', 'es'].indexOf(locale);

    return guidance[id][index]!;
}
