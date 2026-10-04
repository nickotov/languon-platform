'use client';
import { useI18n } from '@/fsd/shared/i18n';
const translations: Record<string, [string, string, string]> = {
    'Sentence practice': [
        'Практика предложений',
        'Pratique des phrases',
        'Práctica de frases',
    ],
    Direction: ['Направление', 'Sens', 'Dirección'],
    'Explanation language': [
        'Язык пояснений',
        'Langue des explications',
        'Idioma de explicación',
    ],
    Vocabulary: ['Словарные слова', 'Vocabulaire', 'Vocabulario'],
    'All eligible entries': [
        'Все подходящие слова',
        'Toutes les entrées admissibles',
        'Todas las entradas válidas',
    ],
    'Choose entries': [
        'Выбрать слова',
        'Choisir les entrées',
        'Elegir entradas',
    ],
    'Search entries': [
        'Поиск слов',
        'Rechercher des entrées',
        'Buscar entradas',
    ],
    'Select all shown': [
        'Выбрать показанные',
        'Sélectionner les entrées affichées',
        'Seleccionar las mostradas',
    ],
    Clear: ['Очистить', 'Effacer', 'Borrar'],
    Sentences: ['Предложения', 'Phrases', 'Frases'],
    'Saved first': [
        'Сначала сохранённые',
        'Enregistrées en premier',
        'Guardadas primero',
    ],
    'Generate new sentences': [
        'Генерировать новые',
        'Générer de nouvelles phrases',
        'Generar frases nuevas',
    ],
    'Review saved only': [
        'Только сохранённые',
        'Réviser les phrases enregistrées',
        'Repasar solo las guardadas',
    ],
    'Start in a dialog': [
        'Начать в диалоге',
        'Démarrer dans une fenêtre',
        'Empezar en un diálogo',
    ],
    'Start in full screen': [
        'Начать на весь экран',
        'Démarrer en plein écran',
        'Empezar a pantalla completa',
    ],
    'Loading entries': [
        'Загрузка слов',
        'Chargement des entrées',
        'Cargando entradas',
    ],
    'Preparing practice': [
        'Подготовка практики',
        'Préparation de la pratique',
        'Preparando la práctica',
    ],
    'Load more entries': [
        'Загрузить ещё слова',
        'Charger plus d’entrées',
        'Cargar más entradas',
    ],
    'No entries match your search.': [
        'По вашему запросу ничего не найдено.',
        'Aucune entrée ne correspond à votre recherche.',
        'Ninguna entrada coincide con tu búsqueda.',
    ],
    'Translate sentences using your dictionary words. Saved sentences and reference answers can be reused.':
        [
            'Переводите предложения со словами из словаря. Сохранённые предложения и эталонные переводы доступны повторно.',
            'Traduisez des phrases avec les mots de votre dictionnaire. Les phrases et réponses de référence enregistrées sont réutilisables.',
            'Traduce frases con las palabras de tu diccionario. Puedes reutilizar frases y respuestas de referencia guardadas.',
        ],
    'Use saved, uncompleted sentences first; generate more when needed.': [
        'Сначала используйте сохранённые незавершённые предложения, затем создавайте новые.',
        'Utilisez d’abord les phrases enregistrées non terminées ; générez-en ensuite si nécessaire.',
        'Usa primero las frases guardadas sin completar; genera más cuando sea necesario.',
    ],
    'Add fresh sentences. Earlier generations stay saved.': [
        'Добавляйте новые предложения. Предыдущие сохраняются.',
        'Ajoutez de nouvelles phrases. Les générations précédentes restent enregistrées.',
        'Añade frases nuevas. Las generaciones anteriores siguen guardadas.',
    ],
    'Reuse saved sentences, including completed ones. No generation.': [
        'Повторяйте сохранённые предложения, включая завершённые. Без генерации.',
        'Réutilisez les phrases enregistrées, même terminées. Aucune génération.',
        'Reutiliza frases guardadas, incluidas las completadas. Sin generación.',
    ],
    'Exposure counts are not mastery scores. Generating sentences and checking with AI use credits. Showing a saved reference answer is free.':
        [
            'Число встреч со словами не оценивает их знание. Генерация и проверка ИИ используют кредиты. Показ сохранённого эталона бесплатен.',
            'Ces compteurs ne mesurent pas la maîtrise. La génération et la vérification IA utilisent des crédits. Afficher une réponse de référence enregistrée est gratuit.',
            'Estos recuentos no miden el dominio. Generar y comprobar con IA usa créditos. Mostrar una referencia guardada es gratis.',
        ],
    'No eligible entries. Add complete translations to your dictionary first.':
        [
            'Нет подходящих слов. Сначала добавьте в словарь полные переводы.',
            'Aucune entrée admissible. Ajoutez d’abord des traductions complètes à votre dictionnaire.',
            'No hay entradas válidas. Añade primero traducciones completas a tu diccionario.',
        ],
    'No saved sentences yet. Choose Saved first or Generate new sentences to create them.':
        [
            'Сохранённых предложений пока нет. Выберите «Сначала сохранённые» или «Генерировать новые».',
            'Aucune phrase enregistrée. Choisissez « Enregistrées en premier » ou « Générer de nouvelles phrases ».',
            'Aún no hay frases guardadas. Elige «Guardadas primero» o «Generar frases nuevas».',
        ],
    Summary: ['Итоги', 'Résumé', 'Resumen'],
    History: ['История', 'Historique', 'Historial'],
    Fullscreen: ['На весь экран', 'Plein écran', 'Pantalla completa'],
    'Switch to dialog': [
        'Перейти в диалог',
        'Passer en fenêtre',
        'Cambiar a diálogo',
    ],
    'Close practice': [
        'Закрыть практику',
        'Fermer la pratique',
        'Cerrar práctica',
    ],
    'Check with AI': [
        'Проверить с ИИ',
        'Vérifier avec l’IA',
        'Comprobar con IA',
    ],
    'Show reference answer': [
        'Показать эталон',
        'Afficher la réponse de référence',
        'Mostrar respuesta de referencia',
    ],
    'Next sentence': [
        'Следующее предложение',
        'Phrase suivante',
        'Siguiente frase',
    ],
    'AI preferences': ['Настройки ИИ', 'Préférences IA', 'Preferencias de IA'],
    'AI task queued': [
        'Задача ИИ в очереди',
        'Tâche IA en attente',
        'Tarea de IA en cola',
    ],
    'AI task running': [
        'Задача ИИ выполняется',
        'Tâche IA en cours',
        'Tarea de IA en curso',
    ],
    'Cancel task': ['Отменить задачу', 'Annuler la tâche', 'Cancelar tarea'],
    'Generating a sentence. Your previous sentences stay saved.': [
        'Генерируется предложение. Предыдущие предложения сохранены.',
        'Une phrase est en cours de génération. Vos phrases précédentes restent enregistrées.',
        'Se está generando una frase. Tus frases anteriores siguen guardadas.',
    ],
    'Checking your submitted answer. Your answer is kept.': [
        'Проверяется отправленный ответ. Ваш ответ сохранён.',
        'Votre réponse envoyée est en cours de vérification. Elle est conservée.',
        'Se está comprobando tu respuesta enviada. Tu respuesta se conserva.',
    ],
    'Cancellation does not guarantee a refund for work already started.': [
        'Отмена не гарантирует возврат кредитов за уже начатую работу.',
        'L’annulation ne garantit pas le remboursement du travail déjà commencé.',
        'Cancelar no garantiza el reembolso del trabajo ya iniciado.',
    ],
    'Native fullscreen is unavailable. Practice fills the window; your session is preserved.':
        [
            'Полноэкранный режим браузера недоступен. Практика занимает окно; сеанс сохранён.',
            'Le plein écran natif est indisponible. La pratique remplit la fenêtre ; votre session est conservée.',
            'La pantalla completa nativa no está disponible. La práctica ocupa la ventana; tu sesión se conserva.',
        ],
    'The task may still be running. Recover its result before submitting again.':
        [
            'Задача может продолжать выполняться. Получите её результат перед повторной отправкой.',
            'La tâche est peut-être encore en cours. Récupérez son résultat avant de renvoyer une réponse.',
            'La tarea puede seguir ejecutándose. Recupera su resultado antes de volver a enviar.',
        ],
    'Loading sentence': [
        'Загрузка предложения',
        'Chargement de la phrase',
        'Cargando frase',
    ],
    'Saved review complete': [
        'Повторение завершено',
        'Révision terminée',
        'Repaso completado',
    ],
    'No eligible sentences': [
        'Нет подходящих предложений',
        'Aucune phrase admissible',
        'No hay frases válidas',
    ],
    'You have reached the end of this session. Start another session to change your words or sentence mode.':
        [
            'Сеанс завершён. Начните новый, чтобы изменить слова или режим предложений.',
            'Vous avez terminé cette session. Commencez-en une autre pour changer les mots ou le mode.',
            'Has llegado al final de esta sesión. Inicia otra para cambiar las palabras o el modo.',
        ],
    'View summary': ['Посмотреть итоги', 'Afficher le résumé', 'Ver resumen'],
    'Use the matching dictionary words. Hints and reference use do not reduce the AI score.':
        [
            'Используйте подходящие слова из словаря. Подсказки и эталон не снижают оценку ИИ.',
            'Utilisez les mots correspondants du dictionnaire. Les indices et la référence ne réduisent pas la note IA.',
            'Usa las palabras correspondientes del diccionario. Las pistas y la referencia no reducen la puntuación de IA.',
        ],
    'Generating sentences and checking with AI use credits. Showing the saved reference answer is free.':
        [
            'Генерация и проверка ИИ используют кредиты. Показ сохранённого эталона бесплатен.',
            'Générer des phrases et vérifier avec l’IA utilise des crédits. Afficher la référence enregistrée est gratuit.',
            'Generar frases y comprobar con IA usa créditos. Mostrar la referencia guardada es gratis.',
        ],
    'Leave practice?': [
        'Выйти из практики?',
        'Quitter la pratique ?',
        '¿Salir de la práctica?',
    ],
    'Keep practising': [
        'Продолжить практику',
        'Continuer la pratique',
        'Seguir practicando',
    ],
    'Leave practice': [
        'Выйти из практики',
        'Quitter la pratique',
        'Salir de la práctica',
    ],
    'Your unsent draft will be discarded. A task already started may continue and its result will be saved to your personal history. Leaving does not cancel the task or guarantee a refund.':
        [
            'Неотправленный черновик будет удалён. Начатая задача может продолжиться; её результат сохранится в личной истории. Выход не отменяет задачу и не гарантирует возврат кредитов.',
            'Votre brouillon non envoyé sera perdu. Une tâche commencée peut continuer et son résultat sera enregistré dans votre historique personnel. Quitter n’annule pas la tâche et ne garantit pas de remboursement.',
            'Se perderá tu borrador sin enviar. Una tarea iniciada puede continuar y su resultado se guardará en tu historial personal. Salir no cancela la tarea ni garantiza un reembolso.',
        ],
    'Session summary': [
        'Итоги сеанса',
        'Résumé de la session',
        'Resumen de la sesión',
    ],
    'Back to practice': [
        'Вернуться к практике',
        'Retour à la pratique',
        'Volver a la práctica',
    ],
    'This session': ['Этот сеанс', 'Cette session', 'Esta sesión'],
    'Sentences seen': [
        'Предложений просмотрено',
        'Phrases vues',
        'Frases vistas',
    ],
    'AI checks': ['Проверки ИИ', 'Vérifications IA', 'Comprobaciones de IA'],
    'Manual reviews': [
        'Ручные просмотры',
        'Révisions manuelles',
        'Revisiones manuales',
    ],
    'AI ratings': ['Оценки ИИ', 'Notes IA', 'Calificaciones de IA'],
    'Manual reviews are separate from AI scores. Seeing an entry in a sentence does not mean it is mastered.':
        [
            'Ручные просмотры учитываются отдельно от оценок ИИ. Встреча со словом в предложении не означает, что оно выучено.',
            'Les révisions manuelles sont séparées des notes IA. Voir une entrée dans une phrase ne signifie pas la maîtriser.',
            'Las revisiones manuales se separan de las puntuaciones de IA. Ver una entrada en una frase no significa dominarla.',
        ],
    'My practice history': [
        'Моя история практики',
        'Mon historique de pratique',
        'Mi historial de práctica',
    ],
    'History type': ['Тип истории', 'Type d’historique', 'Tipo de historial'],
    'Only your own results appear here. Outdated sentences remain readable and cannot be used again.':
        [
            'Здесь только ваши результаты. Устаревшие предложения доступны для чтения, но не для повторной практики.',
            'Seuls vos résultats apparaissent ici. Les phrases obsolètes restent lisibles mais ne sont plus réutilisables.',
            'Aquí solo aparecen tus resultados. Las frases obsoletas siguen siendo legibles, pero no se pueden reutilizar.',
        ],
    'Loading history': [
        'Загрузка истории',
        'Chargement de l’historique',
        'Cargando historial',
    ],
    'No AI checks yet': [
        'Проверок ИИ пока нет',
        'Aucune vérification IA',
        'Aún no hay comprobaciones de IA',
    ],
    'No manual reviews yet': [
        'Ручных просмотров пока нет',
        'Aucune révision manuelle',
        'Aún no hay revisiones manuales',
    ],
    'Results appear after you check a translation with AI.': [
        'Результаты появятся после проверки перевода ИИ.',
        'Les résultats apparaissent après une vérification IA.',
        'Los resultados aparecen después de comprobar una traducción con IA.',
    ],
    'Reviews appear after you choose Show reference answer.': [
        'Просмотры появятся после показа эталона.',
        'Les révisions apparaissent après l’affichage de la réponse de référence.',
        'Las revisiones aparecen al mostrar la respuesta de referencia.',
    ],
    'Outdated · read only': [
        'Устарело · только чтение',
        'Obsolète · lecture seule',
        'Obsoleta · solo lectura',
    ],
    'View details': ['Подробности', 'Afficher les détails', 'Ver detalles'],
    'Load more': ['Загрузить ещё', 'Charger plus', 'Cargar más'],
    'AI feedback': ['Обратная связь ИИ', 'Retour IA', 'Comentarios de IA'],
    Perfect: ['Идеально', 'Parfait', 'Perfecto'],
    Good: ['Хорошо', 'Bien', 'Bien'],
    'Not bad': ['Неплохо', 'Pas mal', 'No está mal'],
    'Practise again later': [
        'Повторите позже',
        'À pratiquer plus tard',
        'Practica de nuevo más tarde',
    ],
    'Reference-assisted': [
        'С использованием эталона',
        'Avec la référence',
        'Con ayuda de referencia',
    ],
    'Your answer': ['Ваш ответ', 'Votre réponse', 'Tu respuesta'],
    Corrections: ['Исправления', 'Corrections', 'Correcciones'],
    'Applies to the whole answer': [
        'Относится ко всему ответу',
        'Concerne toute la réponse',
        'Se aplica a toda la respuesta',
    ],
    'No corrections needed.': [
        'Исправления не нужны.',
        'Aucune correction nécessaire.',
        'No se necesitan correcciones.',
    ],
    'Dictionary words': [
        'Словарные слова',
        'Mots du dictionnaire',
        'Palabras del diccionario',
    ],
    Used: ['Использовано', 'Utilisé', 'Usada'],
    Missing: ['Отсутствует', 'Manquant', 'Falta'],
    'Suggested translation': [
        'Предлагаемый перевод',
        'Traduction suggérée',
        'Traducción sugerida',
    ],
    'Hints and reference use do not reduce your AI score.': [
        'Подсказки и эталон не снижают оценку ИИ.',
        'Les indices et la référence ne réduisent pas votre note IA.',
        'Las pistas y la referencia no reducen tu puntuación de IA.',
    ],
    'Reference translation': [
        'Эталонный перевод',
        'Traduction de référence',
        'Traducción de referencia',
    ],
    'Manually reviewed': [
        'Просмотрено вручную',
        'Révisé manuellement',
        'Revisada manualmente',
    ],
    Hide: ['Скрыть', 'Masquer', 'Ocultar'],
    'Show again': ['Показать снова', 'Afficher à nouveau', 'Mostrar de nuevo'],
    'One valid translation. Your answer may also be correct.': [
        'Один из правильных переводов. Ваш ответ тоже может быть верным.',
        'Une traduction valable. Votre réponse peut aussi être correcte.',
        'Una traducción válida. Tu respuesta también puede ser correcta.',
    ],
    'Recorded as manually reviewed. This sentence counts as completed for Saved first. AI statistics are unchanged. Hiding this panel does not remove the review.':
        [
            'Учтено как ручной просмотр. Предложение завершено для режима «Сначала сохранённые». Статистика ИИ не меняется. Скрытие панели не удаляет просмотр.',
            'Enregistré comme révision manuelle. Cette phrase est terminée pour « Enregistrées en premier ». Les statistiques IA restent inchangées. Masquer ce panneau ne supprime pas la révision.',
            'Registrada como revisión manual. La frase cuenta como completada en «Guardadas primero». Las estadísticas de IA no cambian. Ocultar el panel no elimina la revisión.',
        ],
    'Hints shown:': [
        'Показанные подсказки:',
        'Indices affichés :',
        'Pistas mostradas:',
    ],
    'Use the matching dictionary word. Change its form when needed.': [
        'Используйте соответствующее слово из словаря. При необходимости изменяйте его форму.',
        'Utilisez le mot correspondant du dictionnaire. Adaptez sa forme si nécessaire.',
        'Usa la palabra correspondiente del diccionario. Cambia su forma cuando sea necesario.',
    ],
    'Practice needs your attention': [
        'Нужно ваше внимание',
        'Votre attention est nécessaire',
        'La práctica requiere atención',
    ],
    'Try again': ['Попробовать снова', 'Réessayer', 'Intentar de nuevo'],
    'Practice could not finish this request. Your existing answers are kept.': [
        'Не удалось выполнить запрос. Ваши ответы сохранены.',
        'La requête n’a pas abouti. Vos réponses sont conservées.',
        'No se pudo completar la solicitud. Tus respuestas se conservan.',
    ],
    'Your session expired. Sign in again to continue.': [
        'Сеанс истёк. Войдите снова.',
        'Votre session a expiré. Reconnectez-vous pour continuer.',
        'Tu sesión ha caducado. Inicia sesión de nuevo.',
    ],
    'This dictionary is no longer available. Close practice to return.': [
        'Словарь недоступен. Закройте практику.',
        'Ce dictionnaire n’est plus disponible. Fermez la pratique.',
        'Este diccionario ya no está disponible. Cierra la práctica.',
    ],
    'Access to this dictionary has changed. Close practice to return.': [
        'Доступ к словарю изменился. Закройте практику.',
        'L’accès à ce dictionnaire a changé. Fermez la pratique.',
        'El acceso a este diccionario ha cambiado. Cierra la práctica.',
    ],
    'Sentence practice is not available right now.': [
        'Практика предложений сейчас недоступна.',
        'La pratique des phrases est actuellement indisponible.',
        'La práctica de frases no está disponible ahora.',
    ],
    'These dictionary entries changed. Reload practice to use current sentences.':
        [
            'Слова в словаре изменились. Перезапустите практику.',
            'Ces entrées ont changé. Rechargez la pratique pour obtenir des phrases actuelles.',
            'Estas entradas han cambiado. Recarga la práctica para usar frases actuales.',
        ],
    'Your selected AI model is unavailable. Choose another model or continue with saved reference answers.':
        [
            'Выбранная модель ИИ недоступна. Выберите другую или используйте сохранённые эталоны.',
            'Le modèle IA choisi est indisponible. Choisissez-en un autre ou utilisez les références enregistrées.',
            'El modelo de IA elegido no está disponible. Elige otro o usa referencias guardadas.',
        ],
    'AI tasks are at capacity. Wait a moment and try again.': [
        'Достигнут предел задач ИИ. Подождите и повторите.',
        'La capacité des tâches IA est atteinte. Patientez puis réessayez.',
        'Se ha alcanzado la capacidad de tareas de IA. Espera y vuelve a intentarlo.',
    ],
    'You have no AI credits available. Saved reference answers remain free.': [
        'Кредиты ИИ закончились. Сохранённые эталоны остаются бесплатными.',
        'Vous n’avez plus de crédits IA. Les références enregistrées restent gratuites.',
        'No tienes créditos de IA disponibles. Las referencias guardadas siguen siendo gratis.',
    ],
    'Your daily AI limit has been reached. Saved reference answers remain free.':
        [
            'Дневной лимит ИИ достигнут. Сохранённые эталоны остаются бесплатными.',
            'Votre limite IA quotidienne est atteinte. Les références enregistrées restent gratuites.',
            'Has alcanzado tu límite diario de IA. Las referencias guardadas siguen siendo gratis.',
        ],
    'The request could not be confirmed. Recover its result before starting another task.':
        [
            'Запрос не удалось подтвердить. Получите результат перед новой задачей.',
            'La requête n’a pas pu être confirmée. Récupérez son résultat avant une autre tâche.',
            'No se pudo confirmar la solicitud. Recupera su resultado antes de otra tarea.',
        ],
    'The task result could not be confirmed. Try to recover the task.': [
        'Результат задачи не удалось подтвердить. Попробуйте восстановить задачу.',
        'Le résultat de la tâche n’a pas pu être confirmé. Essayez de la récupérer.',
        'No se pudo confirmar el resultado de la tarea. Intenta recuperarla.',
    ],
    selected: ['выбрано', 'sélectionnées', 'seleccionadas'],
    'eligible entries': [
        'подходящих слов',
        'entrées admissibles',
        'entradas válidas',
    ],
    skipped: ['пропущено', 'ignorées', 'omitidas'],
    'seen in sentences': [
        'встречались в предложениях',
        'vues dans des phrases',
        'vistas en frases',
    ],
    'not seen yet': [
        'ещё не встречались',
        'pas encore vues',
        'sin ver todavía',
    ],
    'saved, uncompleted': [
        'сохранено, не завершено',
        'enregistrées non terminées',
        'guardadas sin completar',
    ],
    'saved for review': [
        'сохранено для повторения',
        'enregistrées pour révision',
        'guardadas para repasar',
    ],
    'entries seen': ['слов просмотрено', 'entrées vues', 'entradas vistas'],
    'words have hints — select an underlined word.': [
        'слов с подсказками — выберите подчёркнутое слово.',
        'mots ont un indice — sélectionnez un mot souligné.',
        'palabras tienen pistas: selecciona una palabra subrayada.',
    ],
    Hint: ['Подсказка', 'Indice', 'Pista'],
    'show hint': ['показать подсказку', 'afficher l’indice', 'mostrar pista'],
    correction: ['исправление', 'correction', 'corrección'],
    meaning: ['смысл', 'sens', 'significado'],
    grammar: ['грамматика', 'grammaire', 'gramática'],
    target: [
        'словарное слово',
        'mot du dictionnaire',
        'palabra del diccionario',
    ],
    'Try again in {seconds}s': [
        'Повторить через {seconds} с',
        'Réessayer dans {seconds} s',
        'Reintentar en {seconds} s',
    ],
    'Your translation ({language})': [
        'Ваш перевод ({language})',
        'Votre traduction ({language})',
        'Tu traducción ({language})',
    ],
    'Check new answer': [
        'Проверить новый ответ',
        'Vérifier une nouvelle réponse',
        'Comprobar nueva respuesta',
    ],
    'Show reference answer — free': [
        'Показать эталон — бесплатно',
        'Afficher la réponse de référence — gratuit',
        'Mostrar respuesta de referencia — gratis',
    ],
    'Skip sentence': [
        'Пропустить предложение',
        'Passer la phrase',
        'Saltar frase',
    ],
    'Restart saved review': [
        'Повторить сохранённые снова',
        'Recommencer la révision',
        'Reiniciar repaso guardado',
    ],
    'Earlier attempts for this sentence': [
        'Ранее отправленные ответы',
        'Tentatives précédentes pour cette phrase',
        'Intentos anteriores para esta frase',
    ],
    'No earlier attempts yet.': [
        'Предыдущих ответов пока нет.',
        'Aucune tentative précédente.',
        'Aún no hay intentos anteriores.',
    ],
    'Task cancelled. Credits depend on work already performed. Your existing answers are kept.':
        [
            'Задача отменена. Списание кредитов зависит от уже выполненной работы. Ваши ответы сохранены.',
            'Tâche annulée. Les crédits dépendent du travail déjà effectué. Vos réponses sont conservées.',
            'Tarea cancelada. Los créditos dependen del trabajo ya realizado. Tus respuestas se conservan.',
        ],
    'Reference-assisted AI checks': [
        'проверок ИИ с эталоном',
        'vérifications IA avec référence',
        'comprobaciones de IA con referencia',
    ],
    'Hint-assisted': ['С подсказками', 'Avec des indices', 'Con pistas'],
    'Assisted AI checks': [
        'проверок ИИ с подсказками или эталоном',
        'vérifications IA avec assistance',
        'comprobaciones de IA con ayuda',
    ],
    'Choose at least one entry to start.': [
        'Выберите хотя бы одно слово.',
        'Choisissez au moins une entrée pour commencer.',
        'Elige al menos una entrada para empezar.',
    ],
    'Why entries are skipped': [
        'Почему слова пропущены',
        'Pourquoi des entrées sont ignorées',
        'Por qué se omiten entradas',
    ],
    'Entries without a complete source and translation are skipped.': [
        'Слова без полного исходного текста и перевода пропускаются.',
        'Les entrées sans texte source et traduction complets sont ignorées.',
        'Se omiten las entradas sin texto original y traducción completos.',
    ],
    'Feedback in {language}': [
        'Объяснения: {language}',
        'Explications en {language}',
        'Explicaciones en {language}',
    ],
    'Loading progress…': [
        'Загрузка прогресса…',
        'Chargement de la progression…',
        'Cargando el progreso…',
    ],
    'Progress unavailable': [
        'Прогресс недоступен',
        'Progression indisponible',
        'Progreso no disponible',
    ],
    'Showing the last loaded progress.': [
        'Показан последний загруженный прогресс.',
        'La dernière progression chargée est affichée.',
        'Se muestra el último progreso cargado.',
    ],
    'Your progress could not be loaded. Your draft is kept.': [
        'Не удалось загрузить прогресс. Ваш черновик сохранён.',
        'La progression n’a pas pu être chargée. Votre brouillon est conservé.',
        'No se pudo cargar el progreso. Se conserva tu borrador.',
    ],
    'Stopping…': ['Остановка…', 'Arrêt en cours…', 'Deteniendo…'],
    'Your answer is over the 4,000-character limit.': [
        'В ответе превышен лимит в 4000 символов.',
        'Votre réponse dépasse la limite de 4000 caractères.',
        'Tu respuesta supera el límite de 4000 caracteres.',
    ],
};
export function useSentenceCopy() {
    const { locale } = useI18n();
    const index = { ru: 0, fr: 1, es: 2, en: -1 }[locale];
    return {
        t(text: string) {
            return index < 0 ? text : (translations[text]?.[index] ?? text);
        },
        languageName(code: string) {
            return (
                new Intl.DisplayNames([locale], { type: 'language' }).of(
                    code,
                ) ?? code
            );
        },
    };
}
