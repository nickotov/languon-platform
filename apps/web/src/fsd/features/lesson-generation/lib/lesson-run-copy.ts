import type { Locale } from '@/fsd/shared/i18n';

const en = {
    title: 'Preparing your lesson',
    complete: 'Your lesson is ready',
    discarded: 'Lesson discarded',
    details: 'Plan and details',
    continue: 'Continue',
    adjust: 'Adjust plan',
    stop: 'Stop',
    discard: 'Discard lesson',
    running:
        'Preparing the next part. You can leave this page and return later.',
    budget: 'This stage is complete. Review the next budget to continue.',
    failed: 'We couldn’t finish this part. Your completed work is saved. This failed attempt wasn’t charged.',
    interrupted: 'Preparation was interrupted. Your completed work is saved.',
    stopped:
        'Preparation stopped. Completed parts are saved; eligible usage from this stage is charged.',
    stopping: 'Stopping… Completed parts will be kept.',
    sourceChanged:
        'Your source material changed. Choose which version to use before continuing.',
    keepSnapshot: 'Keep original sources',
    refreshSources: 'Use current sources',
    selectionRequired:
        'Select the current passage in the editor, then choose Use current sources again.',
    sourceNote:
        'Current sources may require some completed parts to be prepared again.',
    charged: 'Credits charged so far',
    updating: 'Updating credit total…',
    ready: 'Review the complete proposal, then insert it into your draft. Save the document to publish.',
    reconnecting:
        'Reconnecting… Checking the latest progress before another action.',
    stopToAdjust: 'Stop preparation before changing this plan.',
    capacity:
        'This part cannot fit the current limits. Adjust the plan, or increase your AI budget in Settings, then Refresh.',
    error: 'This action could not be completed. Your lesson is saved. Refresh and try again.',
    refresh: 'Refresh',
    pending: 'Waiting',
    working: 'Preparing',
    done: 'Ready',
    taskFailed: 'Needs another attempt',
    progress: (done: number, total: number) =>
        `${done} of ${total} parts ready`,
    quoteTitle: 'Continue preparing this lesson?',
    quoteRevisionTitle: 'Prepare changes to this plan?',
    quoteRevisionDescription:
        'Preparing proposed changes uses chat credits. Applying the reviewed plan is free and keeps lesson preparation paused.',
    quoteDescription:
        'Authorize only the next stage. Your completed work and previous charges remain unchanged.',
    maximum: 'Maximum additional credits',
    expires: 'Budget valid until',
    cancel: 'Cancel',
    quoteExpired: 'This budget expired. Refresh it before continuing.',
    refreshQuote: 'Refresh budget',
    revision: 'Review plan changes',
    revisionStale:
        'This suggestion belongs to an earlier plan. Keep the current plan and request updated changes.',
    resultingOrder: 'Order in the lesson',
    kept: 'Kept',
    changed: 'Updated',
    added: 'Added',
    removed: 'Removed',
    revisionNote:
        'Unchanged completed parts are reused. Updated parts and parts based on them are prepared again.',
    applyRevision: 'Apply plan',
    keepPlan: 'Keep current plan',
    applyNote:
        'Applying this plan is free and keeps preparation paused. Continue separately when ready.',
    adjusting: 'Adjusting this lesson’s plan',
    cancelAdjust: 'Cancel adjustment',
    discardTitle: 'Discard this unfinished lesson?',
    discardNote:
        'Prepared content will be removed. Previous charges remain. This does not change your document.',
};
const ru: typeof en = {
    capacity:
        'Эта часть не помещается в текущие лимиты. Измените план или увеличьте бюджет ИИ в настройках, затем нажмите «Обновить».',
    title: 'Готовим ваш урок',
    complete: 'Урок готов',
    discarded: 'Урок удалён',
    details: 'План и подробности',
    continue: 'Продолжить',
    adjust: 'Изменить план',
    stop: 'Остановить',
    discard: 'Удалить урок',
    running:
        'Готовим следующую часть. Можно уйти со страницы и вернуться позже.',
    budget: 'Этот этап завершён. Проверьте бюджет следующего этапа, чтобы продолжить.',
    failed: 'Не удалось завершить эту часть. Готовые материалы сохранены. Неудачная попытка не оплачивается.',
    interrupted: 'Подготовка прервалась. Готовые материалы сохранены.',
    stopped:
        'Подготовка остановлена. Готовые части сохранены; использованный оплачиваемый объём этого этапа списывается.',
    stopping: 'Останавливаем… Готовые части сохранятся.',
    sourceChanged:
        'Исходные материалы изменились. Выберите версию перед продолжением.',
    keepSnapshot: 'Оставить исходную версию',
    refreshSources: 'Взять текущую версию',
    selectionRequired:
        'Выделите актуальный отрывок в редакторе, затем снова нажмите «Взять текущую версию».',
    sourceNote:
        'При обновлении материалов некоторые готовые части потребуется подготовить заново.',
    charged: 'Уже списано кредитов',
    updating: 'Обновляем сумму списания…',
    ready: 'Просмотрите готовое предложение и вставьте его в черновик. Сохраните документ для публикации.',
    reconnecting:
        'Восстанавливаем связь… Проверяем прогресс перед следующим действием.',
    stopToAdjust: 'Остановите подготовку, чтобы изменить план.',
    error: 'Не удалось выполнить действие. Урок сохранён. Обновите данные и повторите.',
    refresh: 'Обновить',
    pending: 'Ожидает',
    working: 'Готовится',
    done: 'Готово',
    taskFailed: 'Нужна новая попытка',
    progress: (done, total) => `Готово частей: ${done} из ${total}`,
    quoteTitle: 'Продолжить подготовку урока?',
    quoteRevisionTitle: 'Подготовить изменения плана?',
    quoteRevisionDescription:
        'Подготовка изменений оплачивается как ответ в чате. Применение проверенного плана бесплатно и не продолжает подготовку урока.',
    quoteDescription:
        'Вы подтверждаете только следующий этап. Готовые материалы и предыдущие списания сохраняются.',
    maximum: 'Максимум дополнительных кредитов',
    expires: 'Бюджет действует до',
    cancel: 'Отмена',
    quoteExpired: 'Бюджет устарел. Обновите его перед продолжением.',
    refreshQuote: 'Обновить бюджет',
    revision: 'Изменения плана',
    revisionStale:
        'Предложение относится к предыдущему плану. Оставьте текущий план и запросите новые изменения.',
    resultingOrder: 'Порядок в уроке',
    kept: 'Сохранено',
    changed: 'Обновлено',
    added: 'Добавлено',
    removed: 'Убрано',
    revisionNote:
        'Готовые части без изменений используются повторно. Изменённые и зависящие от них части готовятся заново.',
    applyRevision: 'Применить план',
    keepPlan: 'Оставить текущий план',
    applyNote:
        'Применение плана бесплатно и не запускает подготовку. Продолжение подтверждается отдельно.',
    adjusting: 'Изменение плана этого урока',
    cancelAdjust: 'Отменить изменение',
    discardTitle: 'Удалить незавершённый урок?',
    discardNote:
        'Подготовленные материалы будут удалены. Предыдущие списания сохранятся. Документ не изменится.',
};

export function lessonRunCopy(locale: Locale) {
    return locale === 'ru' ? ru : en;
}
