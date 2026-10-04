import type { Locale } from '@/fsd/shared/i18n';
const en = {
    structured: 'Structured text',
    title: 'AI model',
    description:
        'Choose the model for new dictionary and sentence AI requests.',
    scope: 'Applies to dictionary text, sentence generation and AI translation checks. Audio and document reading are not affected. Tasks already started keep their original model; existing sentences, attempts and scores do not change.',
    saved: 'Saved preference',
    draft: 'Your unsaved choice',
    notSaved: 'Not saved',
    auto: 'Auto — use Languon’s default',
    autoHelp:
        'Languon uses an enabled default. The default may change later; your preference stays Auto.',
    noDefault: 'No available default right now. Stored practice still works.',
    legend: 'Model for new requests',
    selected: 'Selected',
    unavailable: 'Unavailable',
    unknown: 'Availability unknown',
    loadingPreference: 'Loading your AI model preference…',
    loadingCatalog: 'Loading available models…',
    preferenceError: 'Could not load your saved preference.',
    catalogError:
        'Could not load available models. Your saved preference is unchanged.',
    retry: 'Retry',
    noModels:
        'No models are available right now. New AI requests cannot run until one is back, including with Auto. Stored practice still works.',
    checkAgain: 'Check again',
    creditHelp:
        'Changing your model is free. New AI requests may need credits. Stored sentences, hints and reference answers remain available without an AI check. A reference is one valid translation, not a verdict on yours.',
    credits: 'View AI credits',
    save: 'Save preference',
    saving: 'Saving…',
    cancel: 'Cancel changes',
    success: 'Preference saved. New requests will use it.',
    dirty: 'You have an unsaved change.',
    unchanged: 'No changes to save.',
    saveError:
        'Your preference was not saved. Your choice is kept; retry when ready.',
    rejected:
        'This model is no longer available. Choose an available model or Auto.',
    chooseAuto: 'Choose Auto',
    conflict:
        'Your saved preference changed. Review the latest saved choice before saving yours.',
    latest: 'Latest saved preference',
    useLatest: 'Use latest',
    overwrite: 'Save my choice instead',
    reloadLatest: 'Reload latest preference',
    offline:
        'You are offline. Your unsaved choice is kept. Saving is available when you reconnect.',
    running:
        'The task in progress keeps the model it started with. This choice applies to future requests.',
    auth: 'Sign in to view and change your AI model preference.',
    inputRate: 'Input credits / million tokens',
    outputRate: 'Output credits / million tokens',
    capabilities: 'Supported tasks',
    dictionary: 'Dictionary text',
    sentences: 'Sentences',
    checks: 'Translation checks',
    noCapabilities: 'No supported task information available.',
    leaveTitle: 'Discard unsaved model preference?',
    leaveDescription:
        'Your model choice has not been saved. Discard it to leave this section.',
    keepEditing: 'Keep editing',
    discard: 'Discard changes',
    close: 'Close dialog',
    missing: 'Your saved model is no longer listed.',
};
type Copy = typeof en;
const ru: Copy = {
    structured: 'Структурированный текст',
    title: 'Модель ИИ',
    description: 'Выберите модель для новых запросов словаря и практики.',
    scope: 'Применяется к тексту словаря, созданию предложений и проверкам перевода ИИ. Аудио и чтение документов не меняются. Начатые задачи сохраняют прежнюю модель; существующие предложения, попытки и оценки не меняются.',
    saved: 'Сохранённый выбор',
    draft: 'Ваш несохранённый выбор',
    notSaved: 'Не сохранено',
    auto: 'Авто — модель Languon по умолчанию',
    autoHelp:
        'Languon использует доступную модель по умолчанию. Она может измениться позже; выбор останется «Авто».',
    noDefault:
        'Сейчас нет доступной модели по умолчанию. Сохранённая практика доступна.',
    legend: 'Модель для новых запросов',
    selected: 'Выбрано',
    unavailable: 'Недоступно',
    unknown: 'Доступность неизвестна',
    loadingPreference: 'Загрузка выбранной модели…',
    loadingCatalog: 'Загрузка доступных моделей…',
    preferenceError: 'Не удалось загрузить сохранённый выбор.',
    catalogError:
        'Не удалось загрузить модели. Сохранённый выбор не изменился.',
    retry: 'Повторить',
    noModels:
        'Сейчас нет доступных моделей. Новые запросы ИИ недоступны, включая «Авто». Сохранённая практика доступна.',
    checkAgain: 'Проверить снова',
    creditHelp:
        'Смена модели бесплатна. Новые запросы ИИ могут требовать кредиты. Сохранённые предложения, подсказки и эталонные ответы доступны без проверки ИИ. Эталон — один из верных переводов, а не оценка вашего ответа.',
    credits: 'Кредиты ИИ',
    save: 'Сохранить выбор',
    saving: 'Сохранение…',
    cancel: 'Отменить изменения',
    success: 'Выбор сохранён. Он применяется к новым запросам.',
    dirty: 'Есть несохранённое изменение.',
    unchanged: 'Нет изменений для сохранения.',
    saveError: 'Выбор не сохранён. Он оставлен; повторите позже.',
    rejected: 'Модель больше недоступна. Выберите доступную модель или «Авто».',
    chooseAuto: 'Выбрать «Авто»',
    conflict:
        'Сохранённый выбор изменился. Сравните его с вашим перед сохранением.',
    latest: 'Последний сохранённый выбор',
    useLatest: 'Использовать последний',
    overwrite: 'Сохранить мой выбор',
    reloadLatest: 'Загрузить последний выбор',
    offline:
        'Нет сети. Ваш выбор сохранён локально до закрытия страницы. Сохранение доступно после подключения.',
    running:
        'Текущая задача сохраняет прежнюю модель. Этот выбор применяется к будущим запросам.',
    auth: 'Войдите, чтобы просмотреть и изменить модель ИИ.',
    inputRate: 'Кредиты ввода / миллион токенов',
    outputRate: 'Кредиты вывода / миллион токенов',
    capabilities: 'Поддерживаемые задачи',
    dictionary: 'Текст словаря',
    sentences: 'Предложения',
    checks: 'Проверки перевода',
    noCapabilities: 'Нет сведений о поддерживаемых задачах.',
    leaveTitle: 'Отменить несохранённый выбор модели?',
    leaveDescription:
        'Выбор модели не сохранён. Отмените изменения, чтобы покинуть раздел.',
    keepEditing: 'Продолжить редактирование',
    discard: 'Отменить изменения',
    close: 'Закрыть окно',
    missing: 'Сохранённой модели больше нет в списке.',
};
const fr: Copy = {
    structured: 'Texte structuré',
    title: 'Modèle IA',
    description:
        'Choisissez le modèle pour les nouvelles demandes du dictionnaire et de pratique.',
    scope: 'S’applique au texte du dictionnaire, aux phrases et aux vérifications IA. L’audio et la lecture des documents ne changent pas. Les tâches commencées gardent leur modèle ; les phrases, tentatives et notes existantes restent inchangées.',
    saved: 'Choix enregistré',
    draft: 'Votre choix non enregistré',
    notSaved: 'Non enregistré',
    auto: 'Auto — modèle par défaut de Languon',
    autoHelp:
        'Languon utilise un modèle disponible par défaut. Il peut changer ; votre choix reste Auto.',
    noDefault:
        'Aucun modèle par défaut disponible. La pratique enregistrée reste accessible.',
    legend: 'Modèle des nouvelles demandes',
    selected: 'Sélectionné',
    unavailable: 'Indisponible',
    unknown: 'Disponibilité inconnue',
    loadingPreference: 'Chargement du choix IA…',
    loadingCatalog: 'Chargement des modèles…',
    preferenceError: 'Impossible de charger le choix enregistré.',
    catalogError:
        'Impossible de charger les modèles. Le choix enregistré reste inchangé.',
    retry: 'Réessayer',
    noModels:
        'Aucun modèle disponible. Les nouvelles demandes IA, y compris Auto, doivent attendre. La pratique enregistrée reste accessible.',
    checkAgain: 'Vérifier à nouveau',
    creditHelp:
        'Changer de modèle est gratuit. Les nouvelles demandes IA peuvent nécessiter des crédits. Les phrases, indices et réponses de référence enregistrés restent accessibles sans vérification IA. La référence est une traduction valable, pas un verdict.',
    credits: 'Voir les crédits IA',
    save: 'Enregistrer le choix',
    saving: 'Enregistrement…',
    cancel: 'Annuler les modifications',
    success: 'Choix enregistré. Il s’applique aux nouvelles demandes.',
    dirty: 'Vous avez une modification non enregistrée.',
    unchanged: 'Aucune modification à enregistrer.',
    saveError: 'Le choix n’a pas été enregistré. Il est conservé ; réessayez.',
    rejected:
        'Ce modèle n’est plus disponible. Choisissez un modèle disponible ou Auto.',
    chooseAuto: 'Choisir Auto',
    conflict:
        'Le choix enregistré a changé. Comparez-le au vôtre avant de continuer.',
    latest: 'Dernier choix enregistré',
    useLatest: 'Utiliser le dernier choix',
    overwrite: 'Enregistrer mon choix',
    reloadLatest: 'Recharger le dernier choix',
    offline:
        'Vous êtes hors ligne. Votre choix est conservé jusqu’à la fermeture de la page. Reconnectez-vous pour enregistrer.',
    running:
        'La tâche en cours garde son modèle initial. Ce choix concerne les prochaines demandes.',
    auth: 'Connectez-vous pour voir et modifier votre modèle IA.',
    inputRate: 'Crédits d’entrée / million de jetons',
    outputRate: 'Crédits de sortie / million de jetons',
    capabilities: 'Tâches prises en charge',
    dictionary: 'Texte du dictionnaire',
    sentences: 'Phrases',
    checks: 'Vérifications de traduction',
    noCapabilities: 'Aucune information sur les tâches disponibles.',
    leaveTitle: 'Abandonner le choix IA non enregistré ?',
    leaveDescription:
        'Le choix du modèle n’a pas été enregistré. Abandonnez-le pour quitter cette section.',
    keepEditing: 'Continuer à modifier',
    discard: 'Abandonner les modifications',
    close: 'Fermer la fenêtre',
    missing: 'Le modèle enregistré ne figure plus dans la liste.',
};
const es: Copy = {
    structured: 'Texto estructurado',
    title: 'Modelo de IA',
    description:
        'Elige el modelo para nuevas solicitudes del diccionario y de práctica.',
    scope: 'Se aplica al texto del diccionario, las frases y las revisiones de IA. El audio y la lectura de documentos no cambian. Las tareas iniciadas conservan su modelo; las frases, los intentos y las notas existentes no cambian.',
    saved: 'Preferencia guardada',
    draft: 'Tu elección sin guardar',
    notSaved: 'Sin guardar',
    auto: 'Auto — modelo predeterminado de Languon',
    autoHelp:
        'Languon usa un modelo predeterminado disponible. Puede cambiar después; tu elección seguirá en Auto.',
    noDefault:
        'No hay un modelo predeterminado disponible. La práctica guardada sigue disponible.',
    legend: 'Modelo para nuevas solicitudes',
    selected: 'Seleccionado',
    unavailable: 'No disponible',
    unknown: 'Disponibilidad desconocida',
    loadingPreference: 'Cargando tu preferencia de IA…',
    loadingCatalog: 'Cargando modelos disponibles…',
    preferenceError: 'No se pudo cargar la preferencia guardada.',
    catalogError:
        'No se pudieron cargar los modelos. Tu preferencia guardada no cambia.',
    retry: 'Reintentar',
    noModels:
        'No hay modelos disponibles. Las nuevas solicitudes de IA, incluido Auto, deben esperar. La práctica guardada sigue disponible.',
    checkAgain: 'Comprobar de nuevo',
    creditHelp:
        'Cambiar de modelo es gratis. Las nuevas solicitudes de IA pueden necesitar créditos. Las frases, pistas y respuestas de referencia guardadas siguen disponibles sin revisión de IA. La referencia es una traducción válida, no una evaluación.',
    credits: 'Ver créditos de IA',
    save: 'Guardar preferencia',
    saving: 'Guardando…',
    cancel: 'Cancelar cambios',
    success: 'Preferencia guardada. Se aplicará a nuevas solicitudes.',
    dirty: 'Tienes un cambio sin guardar.',
    unchanged: 'No hay cambios para guardar.',
    saveError:
        'No se guardó la preferencia. Tu elección se conserva; reinténtalo.',
    rejected: 'Este modelo ya no está disponible. Elige uno disponible o Auto.',
    chooseAuto: 'Elegir Auto',
    conflict:
        'La preferencia guardada cambió. Compárala con tu elección antes de guardar.',
    latest: 'Última preferencia guardada',
    useLatest: 'Usar la última',
    overwrite: 'Guardar mi elección',
    reloadLatest: 'Recargar la última preferencia',
    offline:
        'Sin conexión. Tu elección se conserva hasta cerrar la página. Reconéctate para guardar.',
    running:
        'La tarea en curso conserva su modelo original. Este cambio se aplica a las solicitudes futuras.',
    auth: 'Inicia sesión para ver y cambiar tu modelo de IA.',
    inputRate: 'Créditos de entrada / millón de tokens',
    outputRate: 'Créditos de salida / millón de tokens',
    capabilities: 'Tareas compatibles',
    dictionary: 'Texto del diccionario',
    sentences: 'Frases',
    checks: 'Revisiones de traducción',
    noCapabilities: 'Sin información sobre las tareas compatibles.',
    leaveTitle: '¿Descartar la preferencia sin guardar?',
    leaveDescription:
        'No has guardado tu elección de modelo. Descártala para salir de esta sección.',
    keepEditing: 'Seguir editando',
    discard: 'Descartar cambios',
    close: 'Cerrar ventana',
    missing: 'El modelo guardado ya no aparece en la lista.',
};
export function preferenceCopy(locale: Locale): Copy {
    return { en, ru, fr, es }[locale];
}
