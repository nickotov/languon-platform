import type { Locale } from '@/fsd/shared/i18n';
const copy = {
    en: {
        title: 'AI preferences',
        description: 'Set the maximum credits available for each AI action.',
        scope: 'Languon manages AI services. Your language, tone and explanation preferences remain available in each chat.',
        draft: 'Your unsaved choice',
        loadingPreference: 'Loading your AI model preference…',
        preferenceError: 'Could not load your saved preference.',
        retry: 'Retry',
        creditHelp:
            'Changing your action budget is free. It applies to future requests.',
        credits: 'View AI credits',
        save: 'Save preference',
        saving: 'Saving…',
        cancel: 'Cancel changes',
        success: 'Preference saved. New requests will use it.',
        dirty: 'You have an unsaved change.',
        unchanged: 'No changes to save.',
        saveError:
            'Your preference was not saved. Your choice is kept; retry when ready.',
        conflict:
            'Your saved preference changed. Review the latest saved choice before saving yours.',
        latest: 'Latest saved preference',
        useLatest: 'Use latest',
        overwrite: 'Save my choice instead',
        reloadLatest: 'Reload latest preference',
        offline:
            'You are offline. Your unsaved choice is kept. Saving is available when you reconnect.',
        running:
            'The task in progress keeps its original budget. Changes apply to future requests.',
        auth: 'Sign in to view and change your AI preferences.',
        leaveTitle: 'Discard unsaved AI preferences?',
        leaveDescription:
            'Your action budget has not been saved. Discard it to leave this section.',
        keepEditing: 'Keep editing',
        discard: 'Discard changes',
        close: 'Close dialog',
    },
    ru: {
        title: 'Настройки ИИ',
        description: 'Установите максимум кредитов на одно действие ИИ.',
        scope: 'Languon управляет сервисами ИИ. Язык, тон и стиль объяснений можно настроить в чате.',
        draft: 'Ваш несохранённый выбор',
        loadingPreference: 'Загрузка выбранной модели…',
        preferenceError: 'Не удалось загрузить сохранённый выбор.',
        retry: 'Повторить',
        creditHelp:
            'Изменение бюджета бесплатно и применяется к новым запросам.',
        credits: 'Кредиты ИИ',
        save: 'Сохранить выбор',
        saving: 'Сохранение…',
        cancel: 'Отменить изменения',
        success: 'Выбор сохранён. Он применяется к новым запросам.',
        dirty: 'Есть несохранённое изменение.',
        unchanged: 'Нет изменений для сохранения.',
        saveError: 'Выбор не сохранён. Он оставлен; повторите позже.',
        conflict:
            'Сохранённый выбор изменился. Сравните его с вашим перед сохранением.',
        latest: 'Последний сохранённый выбор',
        useLatest: 'Использовать последний',
        overwrite: 'Сохранить мой выбор',
        reloadLatest: 'Загрузить последний выбор',
        offline:
            'Нет сети. Ваш выбор сохранён локально до закрытия страницы. Сохранение доступно после подключения.',
        running:
            'Текущая задача сохраняет прежний бюджет. Изменения применяются к новым запросам.',
        auth: 'Войдите, чтобы изменить настройки ИИ.',
        leaveTitle: 'Отменить несохранённые настройки ИИ?',
        leaveDescription:
            'Бюджет не сохранён. Отмените изменения, чтобы выйти.',
        keepEditing: 'Продолжить редактирование',
        discard: 'Отменить изменения',
        close: 'Закрыть окно',
    },
    fr: {
        title: 'Préférences IA',
        description: 'Définissez le maximum de crédits par action IA.',
        scope: 'Languon gère les services IA. La langue, le ton et le style restent réglables dans le chat.',
        draft: 'Votre choix non enregistré',
        loadingPreference: 'Chargement du choix IA…',
        preferenceError: 'Impossible de charger le choix enregistré.',
        retry: 'Réessayer',
        creditHelp:
            'Modifier le budget est gratuit et concerne les prochaines demandes.',
        credits: 'Voir les crédits IA',
        save: 'Enregistrer le choix',
        saving: 'Enregistrement…',
        cancel: 'Annuler les modifications',
        success: 'Choix enregistré. Il s’applique aux nouvelles demandes.',
        dirty: 'Vous avez une modification non enregistrée.',
        unchanged: 'Aucune modification à enregistrer.',
        saveError:
            'Le choix n’a pas été enregistré. Il est conservé ; réessayez.',
        conflict:
            'Le choix enregistré a changé. Comparez-le au vôtre avant de continuer.',
        latest: 'Dernier choix enregistré',
        useLatest: 'Utiliser le dernier choix',
        overwrite: 'Enregistrer mon choix',
        reloadLatest: 'Recharger le dernier choix',
        offline:
            'Vous êtes hors ligne. Votre choix est conservé jusqu’à la fermeture de la page. Reconnectez-vous pour enregistrer.',
        running:
            'La tâche en cours garde son budget initial. Les changements concernent les prochaines demandes.',
        auth: 'Connectez-vous pour modifier vos préférences IA.',
        leaveTitle: 'Abandonner les préférences IA non enregistrées ?',
        leaveDescription:
            'Le budget n’est pas enregistré. Abandonnez les modifications pour quitter.',
        keepEditing: 'Continuer à modifier',
        discard: 'Abandonner les modifications',
        close: 'Fermer la fenêtre',
    },
    es: {
        title: 'Preferencias de IA',
        description: 'Define el máximo de créditos por acción de IA.',
        scope: 'Languon gestiona los servicios de IA. El idioma, tono y estilo siguen disponibles en cada chat.',
        draft: 'Tu elección sin guardar',
        loadingPreference: 'Cargando tu preferencia de IA…',
        preferenceError: 'No se pudo cargar la preferencia guardada.',
        retry: 'Reintentar',
        creditHelp:
            'Cambiar el presupuesto es gratis y se aplica a nuevas solicitudes.',
        credits: 'Ver créditos de IA',
        save: 'Guardar preferencia',
        saving: 'Guardando…',
        cancel: 'Cancelar cambios',
        success: 'Preferencia guardada. Se aplicará a nuevas solicitudes.',
        dirty: 'Tienes un cambio sin guardar.',
        unchanged: 'No hay cambios para guardar.',
        saveError:
            'No se guardó la preferencia. Tu elección se conserva; reinténtalo.',
        conflict:
            'La preferencia guardada cambió. Compárala con tu elección antes de guardar.',
        latest: 'Última preferencia guardada',
        useLatest: 'Usar la última',
        overwrite: 'Guardar mi elección',
        reloadLatest: 'Recargar la última preferencia',
        offline:
            'Sin conexión. Tu elección se conserva hasta cerrar la página. Reconéctate para guardar.',
        running:
            'La tarea en curso conserva su presupuesto original. Los cambios se aplican a nuevas solicitudes.',
        auth: 'Inicia sesión para cambiar tus preferencias de IA.',
        leaveTitle: '¿Descartar las preferencias de IA sin guardar?',
        leaveDescription:
            'No has guardado el presupuesto. Descarta los cambios para salir.',
        keepEditing: 'Seguir editando',
        discard: 'Descartar cambios',
        close: 'Cerrar ventana',
    },
};
export function preferenceCopy(locale: Locale) {
    return copy[locale];
}
