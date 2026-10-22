import type {
    PortraitInterviewerOutput,
    PortraitLocaleSchema,
} from '@languon/contracts';
import type { z } from 'zod';
export type InterviewLocale = z.infer<typeof PortraitLocaleSchema>;
export type InterviewTopic = PortraitInterviewerOutput['topic'];
const rows = {
    canSkip: [
        'You can skip this',
        'Можно пропустить',
        'Vous pouvez passer',
        'Puedes saltar',
    ],
    of: ['of', 'из', 'sur', 'de'],
    topicsCovered: [
        'topics covered',
        'тем пройдено',
        'sujets abordés',
        'temas tratados',
    ],

    freePolicy: [
        'Free · Up to 30 actions per account per UTC day, including failed actions. One action at a time.',
        'Бесплатно · До 30 действий на аккаунт за день UTC, включая неудачные. Одно действие за раз.',
        'Gratuit · Jusqu’à 30 actions par compte et par jour UTC, échecs compris. Une action à la fois.',
        'Gratis · Hasta 30 acciones por cuenta y día UTC, incluidos los fallos. Una acción a la vez.',
    ],
    composerFree: ['free', 'бесплатно', 'gratuit', 'gratis'],
    composerPaid: [
        'uses credits',
        'используются кредиты',
        'utilise des crédits',
        'usa créditos',
    ],

    interviewer: ['Interviewer', 'Интервьюер', 'Intervieweur', 'Entrevistador'],
    interviewerTyping: [
        'Interviewer is typing',
        'Интервьюер печатает',
        'L’intervieweur écrit',
        'El entrevistador está escribiendo',
    ],

    resumeUntil: [
        'Paused interviews resume on any device until',
        'Приостановленное интервью можно продолжить на любом устройстве до',
        'Les entretiens en pause peuvent reprendre sur tout appareil jusqu’au',
        'Puedes retomar las entrevistas pausadas en cualquier dispositivo hasta el',
    ],
    characters: ['characters', 'символов', 'caractères', 'caracteres'],
    customAnswerCount: [
        'Custom answer',
        'Свой ответ',
        'Réponse personnelle',
        'Respuesta propia',
    ],

    opensNewTab: [
        'opens in a new tab',
        'открывается в новой вкладке',
        's’ouvre dans un nouvel onglet',
        'se abre en una pestaña nueva',
    ],
    modelSettings: [
        'Model settings',
        'Настройки модели',
        'Paramètres du modèle',
        'Ajustes del modelo',
    ],
    restart: [
        'Start a new interview',
        'Начать новое интервью',
        'Commencer un nouvel entretien',
        'Empezar otra entrevista',
    ],

    knownLanguages: [
        'Languages you know',
        'Языки, которые вы знаете',
        'Langues que vous connaissez',
        'Idiomas que conoces',
    ],
    comfortableLanguages: [
        'Comfortable for explanations',
        'Удобны для объяснений',
        'Langues pour les explications',
        'Idiomas para explicaciones',
    ],
    helpfulApproaches: [
        'Helpful approaches',
        'Удобные подходы',
        'Approches utiles',
        'Enfoques útiles',
    ],
    selectAll: [
        'Select all that apply.',
        'Выберите всё подходящее.',
        'Sélectionnez tout ce qui convient.',
        'Selecciona todo lo que corresponda.',
    ],
    showMoreLanguages: [
        'Show more',
        'Показать ещё',
        'Afficher plus',
        'Mostrar más',
    ],
    describeLanguages: [
        'Describe each language',
        'Опишите каждый язык',
        'Décrivez chaque langue',
        'Describe cada idioma',
    ],

    updateGreeting: [
        'What would you like to update? For this update I can read your saved portrait. Nothing changes until you review and save.',
        'Что бы вы хотели обновить? Для этого обновления я могу прочитать ваш сохранённый портрет. Ничего не изменится, пока вы не проверите и не сохраните.',
        'Que souhaitez-vous mettre à jour ? Pour cette mise à jour, je peux lire votre portrait enregistré. Rien ne change avant votre validation.',
        '¿Qué te gustaría actualizar? Para esta actualización puedo leer tu retrato guardado. Nada cambia hasta que lo revises y guardes.',
    ],

    recoveredAnswer: [
        'Your previous answer',
        'Ваш предыдущий ответ',
        'Votre réponse précédente',
        'Tu respuesta anterior',
    ],
    recoveryTitle: [
        'Your answer was kept. Review it before trying again.',
        'Ответ сохранён. Проверьте его перед повторной отправкой.',
        'Votre réponse est conservée. Relisez-la avant de réessayer.',
        'Tu respuesta se conserva. Revísala antes de volver a intentar.',
    ],
    recoveryStale: [
        'Your portrait changed since this attempt. A retry uses the latest portrait; proposed changes still need your review.',
        'После этой попытки портрет изменился. Повтор использует последнюю версию; изменения потребуют проверки.',
        'Votre portrait a changé. Une nouvelle tentative utilise sa dernière version ; les propositions doivent toujours être validées.',
        'Tu retrato ha cambiado. El reintento usa la última versión; los cambios propuestos requieren revisión.',
    ],
    recoveryCost: [
        'Trying again starts a new AI response under the current pricing notice. Nothing is approved automatically.',
        'Повтор запускает новый AI-ответ на текущих условиях оплаты. Ничего не подтверждается автоматически.',
        'Réessayer lance une nouvelle réponse IA selon l’avis de tarification actuel. Rien n’est validé automatiquement.',
        'Reintentar inicia una nueva respuesta de IA con el aviso de cobro actual. Nada se aprueba automáticamente.',
    ],
    retryAnswer: [
        'Try this answer again',
        'Отправить ответ повторно',
        'Réessayer cette réponse',
        'Reintentar esta respuesta',
    ],

    reviewShort: ['Review', 'Проверить', 'Relire', 'Revisar'],
    unsaved: ['Not saved', 'Не сохранено', 'Non enregistré', 'Sin guardar'],
    itemsCount: [
        'Items in draft',
        'Пунктов в черновике',
        'Éléments du brouillon',
        'Elementos del borrador',
    ],
    pendingCount: [
        'Awaiting your review',
        'Ожидает проверки',
        'À relire',
        'Pendiente de revisión',
    ],
    portraitSoFar: [
        'Your portrait so far',
        'Ваш портрет сейчас',
        'Votre portrait pour le moment',
        'Tu retrato hasta ahora',
    ],

    noInterview: [
        'No interview in progress',
        'Нет незавершённого интервью',
        'Aucun entretien en cours',
        'No hay entrevista en curso',
    ],
    expiryHelp: [
        'Unfinished interviews expire after 14 days without activity. Your approved portrait is unchanged.',
        'Незавершённое интервью удаляется через 14 дней без активности. Подтверждённый портрет не меняется.',
        'Les entretiens expirent après 14 jours sans activité. Votre portrait validé est conservé.',
        'Las entrevistas caducan tras 14 días sin actividad. Tu retrato aprobado no cambia.',
    ],
    start: [
        'Start interview',
        'Начать интервью',
        'Commencer l’entretien',
        'Empezar entrevista',
    ],
    back: [
        'Back to portrait',
        'Назад к портрету',
        'Retour au portrait',
        'Volver al retrato',
    ],
    opening: [
        'Opening interview…',
        'Открываем интервью…',
        'Ouverture de l’entretien…',
        'Abriendo entrevista…',
    ],
    unavailable: [
        'Unable to open interview',
        'Не удалось открыть интервью',
        'Impossible d’ouvrir l’entretien',
        'No se puede abrir la entrevista',
    ],
    retry: ['Try again', 'Повторить', 'Réessayer', 'Reintentar'],
    reconnect: ['Reconnect', 'Подключиться снова', 'Reconnecter', 'Reconectar'],
    kept: [
        'Your unfinished work is kept',
        'Незавершённая работа сохранена',
        'Votre travail en cours est conservé',
        'Tu trabajo pendiente se conserva',
    ],
    manual: [
        'Edit draft by hand',
        'Редактировать вручную',
        'Modifier manuellement',
        'Editar a mano',
    ],
    credits: [
        'Credit settings',
        'Настройки кредитов',
        'Paramètres des crédits',
        'Ajustes de créditos',
    ],
    updateRead: [
        'The interviewer can read your saved portrait for this update',
        'Интервьюер может прочитать сохранённый портрет для обновления',
        'L’intervieweur peut lire votre portrait pour cette mise à jour',
        'El entrevistador puede leer tu retrato para actualizarlo',
    ],
    updateHelp: [
        'It cannot approve changes or turn on personalization. Your approved portrait stays active until you approve the update.',
        'Он не может подтвердить изменения или включить персонализацию. Подтверждённый портрет действует, пока вы не одобрите обновление.',
        'Il ne peut ni valider les modifications ni activer la personnalisation. Votre portrait actuel reste actif jusqu’à votre validation.',
        'No puede aprobar cambios ni activar la personalización. El retrato actual sigue activo hasta que apruebes los cambios.',
    ],
    expirySuffix: [
        '14 days after your last activity',
        '14 дней после последней активности',
        '14 jours après votre dernière activité',
        '14 días desde tu última actividad',
    ],
    pinnedPolicy: [
        'Already-started responses keep their original charging policy.',
        'Начатые ответы сохраняют исходные условия оплаты.',
        'Les réponses en cours conservent leur politique de facturation initiale.',
        'Las respuestas ya iniciadas mantienen su política de cobro original.',
    ],
    paidNoticeTitle: [
        'Interviewer responses now use credits',
        'Теперь ответы интервьюера используют кредиты',
        'Les réponses utilisent maintenant des crédits',
        'Las respuestas ahora usan créditos',
    ],
    paidNoticeDescription: [
        'AI responses use credits under your current settings.',
        'AI-ответы используют кредиты согласно вашим настройкам.',
        'Les réponses IA utilisent des crédits selon vos paramètres.',
        'Las respuestas de IA usan créditos según tus ajustes.',
    ],
    paidNoticeBody: [
        'The next response uses credits. Reviewing, manual editing, approving, and saving stay free.',
        'Следующий ответ использует кредиты. Проверка, ручное редактирование, подтверждение и сохранение бесплатны.',
        'La prochaine réponse utilise des crédits. Relire, modifier, valider et enregistrer restent gratuits.',
        'La próxima respuesta usa créditos. Revisar, editar, aprobar y guardar sigue siendo gratis.',
    ],
    notNow: ['Not now', 'Не сейчас', 'Pas maintenant', 'Ahora no'],
    continuePaid: [
        'Continue with credits',
        'Продолжить за кредиты',
        'Continuer avec des crédits',
        'Continuar con créditos',
    ],
    finishEditing: ['Done', 'Готово', 'Terminé', 'Listo'],
    invalidAnswer: [
        'Choose an answer, write your own, or skip.',
        'Выберите ответ, напишите свой или пропустите вопрос.',
        'Choisissez, écrivez votre réponse ou passez.',
        'Elige, escribe tu respuesta o salta.',
    ],

    sourceQuote: [
        'From your message:',
        'Из вашего сообщения:',
        'D’après votre message :',
        'De tu mensaje:',
    ],
    proposedDetails: [
        'Review proposed details',
        'Проверить предложенные данные',
        'Relire les détails proposés',
        'Revisar detalles propuestos',
    ],
    staleProposal: [
        'Review against your latest portrait before saving.',
        'Перед сохранением сравните с последней версией портрета.',
        'Comparez avec votre dernier portrait avant d’enregistrer.',
        'Compara con tu retrato más reciente antes de guardar.',
    ],
    greeting: [
        'Hi! I’ll ask a few short questions about your languages, goals, and how you like things explained. Skip anything you like — you can review your portrait at any time.',
        'Здравствуйте! Я задам несколько коротких вопросов о ваших языках, целях и удобных объяснениях. Любой вопрос можно пропустить, а портрет — просмотреть в любой момент.',
        'Bonjour ! Quelques questions sur vos langues, vos objectifs et vos préférences. Passez ce que vous voulez et relisez votre portrait à tout moment.',
        '¡Hola! Te haré unas preguntas breves sobre tus idiomas, objetivos y preferencias. Puedes saltar lo que quieras y revisar tu retrato en cualquier momento.',
    ],
    title: [
        'Learner portrait interview',
        'Интервью о вашем обучении',
        'Entretien du portrait',
        'Entrevista de aprendizaje',
    ],
    update: [
        'Update your portrait',
        'Обновить портрет',
        'Mettre à jour votre portrait',
        'Actualizar tu retrato',
    ],
    review: [
        'Review portrait',
        'Проверить портрет',
        'Relire le portrait',
        'Revisar retrato',
    ],
    pause: [
        'Pause interview',
        'Приостановить интервью',
        'Mettre en pause',
        'Pausar entrevista',
    ],
    preview: [
        'Draft preview',
        'Предпросмотр черновика',
        'Aperçu du brouillon',
        'Vista del borrador',
    ],
    optional: [
        'Optional · You can skip this',
        'Необязательно · Можно пропустить',
        'Facultatif · Vous pouvez passer',
        'Opcional · Puedes saltar',
    ],
    custom: [
        'Your own answer (optional)',
        'Свой ответ (необязательно)',
        'Votre réponse (facultatif)',
        'Tu respuesta (opcional)',
    ],
    short: [
        'Short answer for this question · up to 200 characters',
        'Краткий ответ · до 200 символов',
        'Réponse courte · 200 caractères maximum',
        'Respuesta corta · hasta 200 caracteres',
    ],
    skip: ['Skip', 'Пропустить', 'Passer', 'Saltar'],
    next: ['Continue', 'Продолжить', 'Continuer', 'Continuar'],
    language: [
        'Interview language',
        'Язык интервью',
        'Langue de l’entretien',
        'Idioma de entrevista',
    ],
    languages: ['Languages', 'Языки', 'Langues', 'Idiomas'],
    'explanation-languages': [
        'Explanations',
        'Язык объяснений',
        'Explications',
        'Explicaciones',
    ],
    goals: ['Goals', 'Цели', 'Objectifs', 'Objetivos'],
    style: ['Style', 'Стиль', 'Style', 'Estilo'],
    accommodations: [
        'Learning needs',
        'Удобство обучения',
        'Besoins d’apprentissage',
        'Necesidades de aprendizaje',
    ],
    hobbies: ['Interests', 'Интересы', 'Centres d’intérêt', 'Intereses'],
    age: ['Age range', 'Возрастная группа', 'Tranche d’âge', 'Rango de edad'],
    unknown: ['Not specified', 'Не указано', 'Non précisé', 'Sin especificar'],
    learning: [
        'Learning now',
        'Изучаю сейчас',
        'En cours d’apprentissage',
        'Aprendiendo ahora',
    ],
    level: [
        'Your description',
        'Самооценка',
        'Votre description',
        'Tu descripción',
    ],
    chat: [
        'Ask a question or answer in your own words…',
        'Задайте вопрос или ответьте своими словами…',
        'Posez une question ou répondez avec vos mots…',
        'Pregunta o responde con tus palabras…',
    ],
    send: ['Send message', 'Отправить', 'Envoyer', 'Enviar'],
    stop: ['Stop', 'Остановить', 'Arrêter', 'Detener'],
    free: [
        'Free response',
        'Ответ бесплатно',
        'Réponse gratuite',
        'Respuesta gratuita',
    ],
    paid: [
        'Uses credits',
        'Используются кредиты',
        'Utilise des crédits',
        'Usa créditos',
    ],
    add: [
        'Add to draft',
        'Добавить в черновик',
        'Ajouter au brouillon',
        'Añadir al borrador',
    ],
    dismiss: ['Dismiss', 'Отклонить', 'Ignorer', 'Descartar'],
    edit: ['Edit', 'Изменить', 'Modifier', 'Editar'],
    proposal: [
        'Proposed for your draft · not saved yet',
        'Предложение для черновика · ещё не сохранено',
        'Proposition · pas encore enregistrée',
        'Propuesta · aún sin guardar',
    ],
    clarify: [
        'Ask the interviewer',
        'Уточнить у интервьюера',
        'Question à l’intervieweur',
        'Preguntar al entrevistador',
    ],
    answerChat: [
        'Answer in my own words',
        'Ответить своими словами',
        'Répondre avec mes mots',
        'Responder con mis palabras',
    ],
    deeper: [
        'Go a little deeper?',
        'Обсудить подробнее?',
        'Approfondir un peu ?',
        '¿Profundizar un poco?',
    ],
    deeperHelp: [
        'Interests and a broad age range help pick relevant examples. Both are optional.',
        'Интересы и примерный возраст помогут подобрать примеры. Оба вопроса необязательны.',
        'Les intérêts et une tranche d’âge aident à choisir les exemples. Les deux sont facultatifs.',
        'Los intereses y un rango de edad ayudan a elegir ejemplos. Ambos son opcionales.',
    ],
    done: [
        'That’s everything for now',
        'На сегодня всё',
        'C’est tout pour le moment',
        'Eso es todo por ahora',
    ],
} satisfies Record<string, string[]>;
export function interviewText(locale: InterviewLocale, key: keyof typeof rows) {
    return rows[key][['en', 'ru', 'fr', 'es'].indexOf(locale)]!;
}
export const interviewCoreTopics: InterviewTopic[] = [
    'languages',
    'explanation-languages',
    'goals',
    'style',
    'accommodations',
];
export const interviewAllTopics: InterviewTopic[] = [
    ...interviewCoreTopics,
    'hobbies',
    'age',
];
export const interviewLevels = [
    'just-starting',
    'basic',
    'intermediate',
    'advanced',
    'fluent',
    'native',
    'unsure',
] as const;
const levelRows = [
    ['Just starting', 'Только начинаю', 'Débutant absolu', 'Empezando'],
    ['Basic', 'Базовый', 'Élémentaire', 'Básico'],
    ['Intermediate', 'Средний', 'Intermédiaire', 'Intermedio'],
    ['Advanced', 'Продвинутый', 'Avancé', 'Avanzado'],
    ['Fluent', 'Свободный', 'Courant', 'Fluido'],
    ['Native', 'Родной', 'Langue maternelle', 'Nativo'],
    ['Unsure', 'Не уверен(а)', 'Je ne sais pas', 'No lo sé'],
];
export function interviewLevelOptions(locale: InterviewLocale) {
    return interviewLevels.map((value, index) => ({
        value,
        label: levelRows[index]![['en', 'ru', 'fr', 'es'].indexOf(locale)]!,
    }));
}

const errors: Record<string, string[]> = {
    invalid_model_output: [
        'The interviewer returned a response we couldn’t use. Your answer and draft are kept. Retry when you’re ready, or edit your portrait by hand.',
        'Интервьюер вернул ответ, который не удалось обработать. Ваш ответ и черновик сохранены. Повторите попытку, когда будете готовы, или отредактируйте портрет вручную.',
        'La réponse de l’intervieweur n’a pas pu être utilisée. Votre réponse et votre brouillon sont conservés. Réessayez quand vous le souhaitez ou modifiez votre portrait manuellement.',
        'No se pudo utilizar la respuesta del entrevistador. Tu respuesta y borrador se conservan. Reintenta cuando quieras o edita tu retrato a mano.',
    ],
    model_unavailable: [
        'The selected model is unavailable for interviews. Choose Auto or DeepSeek Flash in model settings, then try again. Your answer and draft are kept.',
        'Выбранная модель недоступна для интервью. Выберите «Авто» или DeepSeek Flash в настройках модели и повторите попытку. Ответ и черновик сохранены.',
        'Le modèle sélectionné est indisponible pour les entretiens. Choisissez Auto ou DeepSeek Flash dans les paramètres, puis réessayez. Votre réponse et votre brouillon sont conservés.',
        'El modelo seleccionado no está disponible para entrevistas. Elige Auto o DeepSeek Flash en los ajustes y vuelve a intentarlo. Tu respuesta y borrador se conservan.',
    ],
    capacity_unavailable: [
        'The interviewer is busy. Your answer is kept; try again shortly or edit your draft by hand.',
        'Интервьюер занят. Ответ сохранён; повторите попытку позже или отредактируйте черновик вручную.',
        'L’intervieweur est occupé. Votre réponse est conservée ; réessayez bientôt ou modifiez le brouillon manuellement.',
        'El entrevistador está ocupado. Tu respuesta se conserva; inténtalo en breve o edita el borrador a mano.',
    ],
    rate_limited: [
        'Please wait a moment before trying again. Your answer and draft are kept.',
        'Подождите немного перед повторной попыткой. Ответ и черновик сохранены.',
        'Patientez un instant avant de réessayer. Votre réponse et votre brouillon sont conservés.',
        'Espera un momento antes de reintentar. Tu respuesta y borrador se conservan.',
    ],

    version_conflict: [
        'Your portrait changed. Review against the latest version before saving.',
        'Портрет изменился. Сравните с последней версией перед сохранением.',
        'Votre portrait a changé. Comparez avec la dernière version.',
        'Tu retrato cambió. Revisa la versión más reciente.',
    ],
    credits_exhausted: [
        'Your available credits cannot cover this response’s maximum credit hold. Add credits, or review and edit your saved draft for free.',
        'Доступных кредитов не хватает для максимального резерва на этот ответ. Пополните баланс или бесплатно проверьте и отредактируйте сохранённый черновик.',
        'Vos crédits disponibles ne couvrent pas la réserve maximale pour cette réponse. Ajoutez des crédits ou relisez et modifiez gratuitement votre brouillon conservé.',
        'Tus créditos disponibles no cubren la reserva máxima para esta respuesta. Añade créditos o revisa y edita gratis tu borrador guardado.',
    ],
    resource_limit: [
        'Interview limit reached. Review or edit your draft; your work is kept.',
        'Достигнут лимит интервью. Проверьте или отредактируйте сохранённый черновик.',
        'Limite atteinte. Relisez ou modifiez votre brouillon conservé.',
        'Límite alcanzado. Revisa o edita tu borrador guardado.',
    ],
    cancelled: [
        'Response stopped. Your draft is unchanged.',
        'Ответ остановлен. Черновик не изменился.',
        'Réponse arrêtée. Votre brouillon est inchangé.',
        'Respuesta detenida. Tu borrador no cambia.',
    ],
};
export function interviewErrorMessage(locale: InterviewLocale, code: string) {
    const fallback = [
        'Unable to continue right now. Your unfinished work is kept. Reconnect, or review and edit it by hand.',
        'Сейчас не удалось продолжить. Работа сохранена. Подключитесь снова или отредактируйте черновик вручную.',
        'Impossible de continuer. Votre travail est conservé. Reconnectez-vous ou modifiez le brouillon manuellement.',
        'No se puede continuar ahora. Tu trabajo se conserva. Reconecta o edita el borrador a mano.',
    ];
    return (errors[code] ?? fallback)[
        ['en', 'ru', 'fr', 'es'].indexOf(locale)
    ]!;
}
