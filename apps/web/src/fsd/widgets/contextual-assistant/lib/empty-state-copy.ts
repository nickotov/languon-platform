import type { ConversationSource } from '@languon/contracts';
import type { Locale } from '@/fsd/shared/i18n';
const copy = {
    en: {
        heading: 'Ask about',
        text: 'The tutor can read this text and its available translation. Select a passage on the page, or start with:',
        dictionary:
            'The tutor knows this dictionary and can look up its cards. Attach a few cards to compare, or start with:',
        knowledge:
            'The tutor can read this note. Ask a question, or start with:',
        textQuestions: [
            'Explain the grammar in this passage.',
            'Explain the tone of this passage.',
            'Compare two expressions in this text.',
        ],
        dictionaryQuestions: [
            'Compare these two expressions.',
            'Which of these sounds most formal?',
            'Give me everyday examples.',
        ],
        knowledgeQuestions: [
            'Is there a common mistake I should add?',
            'Explain this rule more simply.',
            'Compare these two expressions.',
        ],
    },
    ru: {
        heading: 'Спросите о',
        text: 'Помощник может прочитать этот текст и доступный перевод. Выделите отрывок на странице или начните с вопроса:',
        dictionary:
            'Помощник знает этот словарь и может находить его карточки. Прикрепите карточки для сравнения или начните с вопроса:',
        knowledge:
            'Помощник может прочитать эту заметку. Задайте вопрос или начните с подсказки:',
        textQuestions: [
            'Объясни грамматику в этом отрывке.',
            'Объясни тон этого отрывка.',
            'Сравни два выражения из этого текста.',
        ],
        dictionaryQuestions: [
            'Сравни эти два выражения.',
            'Какое из них звучит более формально?',
            'Приведи повседневные примеры.',
        ],
        knowledgeQuestions: [
            'Какую типичную ошибку стоит добавить?',
            'Объясни это правило проще.',
            'Сравни эти два выражения.',
        ],
    },
    es: {
        heading: 'Pregunta sobre',
        text: 'El tutor puede leer este texto y su traducción disponible. Selecciona un pasaje o empieza con:',
        dictionary:
            'El tutor conoce este diccionario y puede consultar sus tarjetas. Adjunta algunas para compararlas o empieza con:',
        knowledge:
            'El tutor puede leer esta nota. Haz una pregunta o empieza con:',
        textQuestions: [
            'Explica la gramática de este pasaje.',
            'Explica el tono de este pasaje.',
            'Compara dos expresiones de este texto.',
        ],
        dictionaryQuestions: [
            'Compara estas dos expresiones.',
            '¿Cuál suena más formal?',
            'Dame ejemplos cotidianos.',
        ],
        knowledgeQuestions: [
            '¿Hay algún error común que deba añadir?',
            'Explica esta regla de forma más sencilla.',
            'Compara estas dos expresiones.',
        ],
    },
    fr: {
        heading: 'Posez une question sur',
        text: 'Le tuteur peut lire ce texte et sa traduction disponible. Sélectionnez un passage ou commencez par :',
        dictionary:
            'Le tuteur connaît ce dictionnaire et peut consulter ses fiches. Joignez des fiches à comparer ou commencez par :',
        knowledge:
            'Le tuteur peut lire cette note. Posez une question ou commencez par :',
        textQuestions: [
            'Explique la grammaire de ce passage.',
            'Explique le ton de ce passage.',
            'Compare deux expressions de ce texte.',
        ],
        dictionaryQuestions: [
            'Compare ces deux expressions.',
            'Laquelle est la plus formelle ?',
            'Donne des exemples du quotidien.',
        ],
        knowledgeQuestions: [
            'Y a-t-il une erreur courante à ajouter ?',
            'Explique cette règle plus simplement.',
            'Compare ces deux expressions.',
        ],
    },
};
export function emptyStateCopy(
    locale: Locale,
    kind: ConversationSource['kind'],
) {
    const labels = copy[locale];
    const suggestions = {
        text: labels.textQuestions,
        dictionary: labels.dictionaryQuestions,
        knowledge: labels.knowledgeQuestions,
    };
    return {
        heading: labels.heading,
        intro: labels[kind],
        suggestions: suggestions[kind],
    };
}
