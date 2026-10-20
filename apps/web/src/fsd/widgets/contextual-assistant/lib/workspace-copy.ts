import type { Locale } from '@/fsd/shared/i18n';

const copy = {
    en: {
        selectionChanged:
            'The selected passage changed or was removed. Select the passage again and choose Ask tutor before sending.',
        context: 'Reads this document when you send',
        hint: 'The tutor reads your full current document, including unsaved edits, when you send.',
        placeholder: 'Ask about your document…',
        selection: 'Ask about the selected passage…',
        document: 'Document',
        emptyHeading: 'Let’s start your document together',
        emptyIntro:
            'Ask for an outline or an example — you can add the reply to your document.',
        heading: 'How can I help with this document?',
        intro: 'Ask about the whole document or select a passage to explain, correct or translate.',
        prompts: [
            'Check the grammar in my document',
            'Create exercises based on this document',
            'Explain the main language points more simply',
        ],
        emptyPrompts: [
            'Suggest an outline for my study notes',
            'Help me start a lesson summary',
            'Which topics should I cover in these notes?',
        ],
        settings: 'Response settings',
        characters: 'characters',
        sees: 'Reads',
        limit: 'Document exceeds the tutor limit',
        suggestion: 'Suggested document edit',
    },
    ru: {
        selectionChanged:
            'Выделенный фрагмент изменён или удалён. Выделите его снова и выберите «Спросить репетитора» перед отправкой.',
        context: 'Читает документ при отправке сообщения',
        hint: 'При отправке репетитор читает весь текущий документ, включая несохранённые правки.',
        placeholder: 'Спросите о документе…',
        selection: 'Спросите о выделенном фрагменте…',
        document: 'Документ',
        emptyHeading: 'Начнём документ вместе',
        emptyIntro:
            'Попросите план или пример — ответ можно добавить в документ одним действием.',
        heading: 'Чем помочь с этим документом?',
        intro: 'Спросите о документе целиком или выделите фрагмент — его можно объяснить, исправить или перевести.',
        prompts: [
            'Проверь грамматику в документе',
            'Составь упражнения по документу',
            'Объясни основные языковые правила проще',
        ],
        emptyPrompts: [
            'Предложи план конспекта',
            'Помоги начать конспект урока',
            'Какие темы стоит описать в такой заметке?',
        ],
        settings: 'Настройки ответа',
        characters: 'символов',
        sees: 'Видит',
        limit: 'Документ длиннее лимита репетитора',
        suggestion: 'Предложение для документа',
    },
    es: {
        selectionChanged:
            'El pasaje seleccionado cambió o se eliminó. Selecciónalo de nuevo y elige Preguntar al tutor antes de enviar.',
        context: 'Lee este documento cuando envías',
        hint: 'El tutor lee todo el documento actual, incluidos los cambios sin guardar, cuando envías.',
        placeholder: 'Pregunta sobre tu documento…',
        selection: 'Pregunta sobre el pasaje seleccionado…',
        document: 'Documento',
        emptyHeading: 'Empecemos el documento juntos',
        emptyIntro:
            'Pide un esquema o un ejemplo y añade la respuesta a tu documento.',
        heading: '¿Cómo puedo ayudarte con este documento?',
        intro: 'Pregunta sobre el documento o selecciona un pasaje para explicarlo, corregirlo o traducirlo.',
        prompts: [
            'Revisa la gramática de mi documento',
            'Crea ejercicios basados en este documento',
            'Explica los puntos de idioma más fácilmente',
        ],
        emptyPrompts: [
            'Sugiere un esquema para mis apuntes',
            'Ayúdame a empezar un resumen de la lección',
            '¿Qué temas debería incluir en estos apuntes?',
        ],
        settings: 'Configuración de respuestas',
        characters: 'caracteres',
        sees: 'Lee',
        limit: 'El documento supera el límite del tutor',
        suggestion: 'Edición sugerida',
    },
    fr: {
        selectionChanged:
            'Le passage sélectionné a changé ou a été supprimé. Sélectionnez-le à nouveau et choisissez Interroger le tuteur avant l’envoi.',
        context: 'Lit ce document à chaque envoi',
        hint: 'Le tuteur lit tout le document actuel, y compris les modifications non enregistrées, à chaque envoi.',
        placeholder: 'Posez une question sur votre document…',
        selection: 'Posez une question sur le passage sélectionné…',
        document: 'Document',
        emptyHeading: 'Commençons votre document ensemble',
        emptyIntro:
            'Demandez un plan ou un exemple, puis ajoutez la réponse au document.',
        heading: 'Comment vous aider avec ce document ?',
        intro: 'Posez une question sur le document ou sélectionnez un passage à expliquer, corriger ou traduire.',
        prompts: [
            'Vérifie la grammaire de mon document',
            'Crée des exercices à partir du document',
            'Explique plus simplement les points de langue',
        ],
        emptyPrompts: [
            'Propose un plan pour mes notes',
            'Aide-moi à commencer un résumé de cours',
            'Quels sujets devrais-je aborder dans ces notes ?',
        ],
        settings: 'Paramètres des réponses',
        characters: 'caractères',
        sees: 'Lit',
        limit: 'Le document dépasse la limite du tuteur',
        suggestion: 'Modification proposée',
    },
};

export function workspaceCopy(locale: Locale) {
    return copy[locale];
}
