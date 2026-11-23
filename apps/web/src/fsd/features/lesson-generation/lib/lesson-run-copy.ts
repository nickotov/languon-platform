import { conversationCopy } from '@/fsd/entities/conversation';
import type { Locale } from '@/fsd/shared/i18n';

const en = {
    recordingBudget:
        'This budget covers the remaining lesson content and speech synthesis.',
    title: 'Preparing your lesson',
    complete: 'Your lesson is ready',
    planChangeNeeded: 'Your lesson needs a plan change',
    discarded: 'Lesson discarded',
    details: 'Plan and details',
    continue: 'Continue',
    retryRemaining: 'Retry remaining part',
    retryExercise: (index: number) => `Resume from exercise ${index}`,
    failedExercise: (index: number, total: number) =>
        `Exercise ${index} of ${total} needs another attempt`,
    exerciseOrdinal: (index: number, total: number) =>
        `Exercise ${index} of ${total}`,
    repairing:
        'Automatically correcting this part within your approved budget.',
    recoveryExhausted:
        'We could not produce a valid result for this part after automatic retries. Your prepared content is saved. Adjust the requirements for this part to continue.',
    failureAnswerKey:
        'The generated answer key is invalid. Resume from this exercise; completed exercises are saved and the failed attempt was not charged.',
    preview: 'View prepared content',
    backToChat: 'Back to chat',
    previewTitle: 'Prepared content',
    previewNote:
        'Work in progress. More content will appear here as preparation finishes. Insert and Save become available with the complete lesson.',
    previewLoading: 'Loading prepared content…',
    previewError:
        'Prepared content could not be loaded. Your progress is saved.',
    previewRetry: 'Retry preview',
    previewDenied: 'Prepared content is no longer available to this account.',
    previewEmpty: 'The first part is still being prepared.',
    previewPending: 'This part is still being prepared.',
    automatic:
        'Continues automatically within your approved budget. You can leave this page and return later.',
    unitProgress: (done: number, total: number) =>
        `${done} of ${total} exercises ready`,
    entryProgress: (done: number, total: number) =>
        `${done} of ${total} vocabulary entries ready`,
    failureOutput:
        'This response reached its output limit. Completed work is saved; the failed attempt was not charged.',
    failureSchema:
        'The generated response did not match the required format. Completed work is saved; the failed attempt was not charged.',
    failureContent:
        'An exercise did not pass validation. Completed work is saved; the failed attempt was not charged.',
    failureFiltered:
        'The provider declined this part under its content policy. Adjust the plan before continuing.',
    failureReading:
        'The returned reading could not be added to the lesson because its format was invalid. Resume from the reading.',
    failureCheckpoint:
        'The lesson could not save this part. You can resume from the last saved part.',
    failureReceipt:
        'The service could not record the result of this attempt. Use the support reference if this happens again.',
    failureRateLimited:
        'The AI provider is receiving too many requests. Try again later. This attempt was not charged.',
    failureTransport:
        'The AI connection failed. Completed work is saved; the failed attempt was not charged.',
    failurePublication:
        'The lesson could not be assembled. Completed work is saved; the failed attempt was not charged.',
    failureUnknown:
        'An unexpected error interrupted preparation. Completed work is saved; the failed attempt was not charged. Retry the remaining part.',
    failureReference: 'Support reference',
    adjust: 'Adjust plan',
    stop: 'Stop',
    discard: 'Discard lesson',
    budget: 'The approved budget has been reached. Review a new budget to finish the remaining work.',
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
    reconnecting:
        'Reconnecting… Checking the latest progress before another action.',
    capacity:
        'This part cannot fit the current limits. Adjust the plan, or increase your AI budget in Settings, then Refresh.',
    authorizeAttempt: 'Authorize another attempt',
    authorizeAdjustment: 'Authorize a plan adjustment',
    outcomeUnknown:
        'The AI provider may have processed the last request. Its result could not be confirmed. Your saved work is available. Authorizing another attempt sends a new request under the approved budget.',
    providerRejected:
        'The AI provider rejected this request. Review the plan or try again later.',
    authorityExpired:
        'Automatic preparation paused because the authorization expired. Continue to authorize the remaining work.',
    stageLimit:
        'This authorization reached its stage limit. Continue to authorize the remaining work.',
    balance: 'Check your credit balance before continuing.',
    sourceUnavailable:
        'The source is unavailable. Restore access or update the lesson sources.',
    predispatchRetry:
        'The service is busy. Preparation will retry automatically within the approved budget.',
    serviceCapacity:
        'The AI service is at capacity. Your saved parts are available. Try again later.',
    providerCapacity: conversationCopy('en').providerCapacity,
    operatorCapacity: conversationCopy('en').operatorCapacity,
    admissionRejected: 'The request was rejected before generation started.',
    inputTooLarge:
        'The source material for this step exceeds the input limit. Shorten the source or adjust the plan.',
    turnActive:
        'Another response is in progress. Wait for it to finish and refresh.',
    reviewCurrent:
        'The lesson has changed. Refresh and review its current progress.',
    authorityConfig: 'Review the AI budget in Settings before continuing.',
    uncertainAction:
        'The request could not be confirmed. Refresh to check progress before trying again.',
    readFailed: 'Lesson progress could not be loaded.',
    error: 'This action could not be completed. Your lesson is saved. Refresh and try again.',
    refresh: 'Refresh',
    pending: 'Waiting',
    working: 'Preparing',
    done: 'Ready',
    taskFailed: 'Needs another attempt',
    couldNotPrepare: 'Could not prepare',
    progress: (done: number, total: number) =>
        `${done} of ${total} parts ready`,
    quoteTitle: 'Continue preparing this lesson?',
    quoteRevisionTitle: 'Prepare changes to this plan?',
    quoteRevisionDescription:
        'Preparing proposed changes uses chat credits. Applying the reviewed plan is free and keeps lesson preparation paused.',
    quoteDescription:
        'This additional budget covers the remaining lesson, including automatic retries. Prepared parts are kept.',
    maximum: 'Maximum additional credits',
    stageOutput: 'Approximate output tokens per stage',
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
    recordingBudget:
        'В этот бюджет входят оставшиеся материалы урока и озвучивание.',
    capacity:
        'Эта часть не помещается в текущие лимиты. Измените план или увеличьте бюджет ИИ в настройках, затем нажмите «Обновить».',
    title: 'Готовим ваш урок',
    complete: 'Урок готов',
    planChangeNeeded: 'Измените план урока',
    discarded: 'Урок удалён',
    details: 'План и подробности',
    continue: 'Продолжить',
    retryRemaining: 'Повторить оставшуюся часть',
    retryExercise: (index) => `Продолжить с упражнения №${index}`,
    failedExercise: (index, total) =>
        `Упражнение ${index} из ${total} нужно повторить`,
    exerciseOrdinal: (index, total) => `Упражнение ${index} из ${total}`,
    repairing:
        'Автоматически исправляем эту часть в рамках подтверждённого бюджета.',
    recoveryExhausted:
        'После автоматических попыток эту часть не удалось подготовить в нужном формате. Готовые материалы сохранены. Чтобы продолжить, измените требования к этой части.',
    failureAnswerKey:
        'Готовый ключ ответа некорректен. Продолжите с этого упражнения; готовые упражнения сохранены, неудачная попытка не оплачивается.',
    preview: 'Посмотреть готовое',
    backToChat: 'Назад в чат',
    previewTitle: 'Готовые материалы',
    previewNote:
        'Урок ещё готовится. Здесь будут появляться новые материалы. Вставка и сохранение доступны после завершения всего урока.',
    previewLoading: 'Загружаем готовые материалы…',
    previewError: 'Не удалось загрузить материалы. Ваш прогресс сохранён.',
    previewRetry: 'Повторить загрузку',
    previewDenied: 'Подготовленные материалы больше недоступны этому аккаунту.',
    previewEmpty: 'Первая часть ещё готовится.',
    previewPending: 'Эта часть ещё готовится.',
    automatic:
        'Продолжаем автоматически в рамках подтверждённого бюджета. Можно уйти со страницы и вернуться позже.',
    unitProgress: (done, total) => `Готово упражнений: ${done} из ${total}`,
    entryProgress: (done, total) =>
        `Готово словарных записей: ${done} из ${total}`,
    failureOutput:
        'Ответ достиг предельного объёма. Готовые материалы сохранены; неудачная попытка не оплачивается.',
    failureSchema:
        'Ответ не соответствует нужному формату. Готовые материалы сохранены; неудачная попытка не оплачивается.',
    failureContent:
        'Упражнение не прошло проверку. Готовые материалы сохранены; неудачная попытка не оплачивается.',
    failureFiltered:
        'Провайдер ИИ отклонил эту часть из-за ограничений на содержимое. Измените план, чтобы продолжить.',
    failureReading:
        'Не удалось добавить текст для чтения в урок из-за ошибки в формате ответа. Можно продолжить с подготовки текста.',
    failureCheckpoint:
        'Не удалось сохранить эту часть урока. Можно продолжить с последней сохранённой части.',
    failureReceipt:
        'Не удалось зафиксировать результат этой попытки. Если ошибка повторится, передайте код в поддержку.',
    failureRateLimited:
        'Сервис ИИ временно ограничил число запросов. Попробуйте позже. За эту попытку плата не списана.',
    failureTransport:
        'Связь с ИИ прервалась. Готовые материалы сохранены; неудачная попытка не оплачивается.',
    failurePublication:
        'Не удалось собрать урок. Готовые материалы сохранены; неудачная попытка не оплачивается.',
    failureUnknown:
        'Подготовка прервалась из-за непредвиденной ошибки. Готовые материалы сохранены; неудачная попытка не оплачивается. Повторите оставшуюся часть.',
    failureReference: 'Код для поддержки',
    adjust: 'Изменить план',
    stop: 'Остановить',
    discard: 'Удалить урок',
    budget: 'Подтверждённый бюджет исчерпан. Проверьте новый бюджет, чтобы завершить оставшиеся материалы.',
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
    reconnecting:
        'Восстанавливаем связь… Проверяем прогресс перед следующим действием.',
    authorizeAttempt: 'Разрешить новую попытку',
    authorizeAdjustment: 'Разрешить изменение плана',
    outcomeUnknown:
        'Возможно, сервис ИИ обработал последний запрос, но результат подтвердить не удалось. Готовые материалы сохранены. Новая попытка отправит ещё один запрос в пределах разрешённого бюджета.',
    providerRejected:
        'Сервис ИИ отклонил запрос. Проверьте план или попробуйте позже.',
    authorityExpired:
        'Срок разрешения на автоматическую подготовку истёк. Продолжите, чтобы разрешить подготовку оставшихся частей.',
    stageLimit:
        'Достигнут лимит этапов по текущему разрешению. Продолжите, чтобы разрешить подготовку оставшихся частей.',
    balance: 'Перед продолжением проверьте баланс кредитов.',
    sourceUnavailable:
        'Исходный материал недоступен. Восстановите доступ или обновите источники урока.',
    predispatchRetry:
        'Сервис занят. Подготовка возобновится автоматически в пределах разрешённого бюджета.',
    serviceCapacity:
        'Сервис ИИ сейчас занят. Готовые части сохранены. Попробуйте продолжить позже.',
    providerCapacity: conversationCopy('ru').providerCapacity,
    operatorCapacity: conversationCopy('ru').operatorCapacity,
    admissionRejected: 'Запрос отклонён до начала генерации.',
    inputTooLarge:
        'Исходный материал этой части превышает лимит ввода. Сократите материал или измените план.',
    turnActive:
        'Сейчас готовится другой ответ. Дождитесь его завершения и обновите данные.',
    reviewCurrent: 'Урок изменился. Обновите данные и проверьте готовые части.',
    authorityConfig: 'Проверьте бюджет ИИ в настройках перед продолжением.',
    uncertainAction:
        'Не удалось подтвердить запрос. Обновите данные и проверьте прогресс перед повтором.',
    readFailed: 'Не удалось загрузить прогресс урока.',
    error: 'Не удалось выполнить действие. Урок сохранён. Обновите данные и повторите.',
    refresh: 'Обновить',
    pending: 'Ожидает',
    working: 'Готовится',
    done: 'Готово',
    taskFailed: 'Нужна новая попытка',
    couldNotPrepare: 'Не удалось подготовить',
    progress: (done, total) => `Готово частей: ${done} из ${total}`,
    quoteTitle: 'Продолжить подготовку урока?',
    quoteRevisionTitle: 'Подготовить изменения плана?',
    quoteRevisionDescription:
        'Подготовка изменений оплачивается как ответ в чате. Применение проверенного плана бесплатно и не продолжает подготовку урока.',
    quoteDescription:
        'Этот дополнительный бюджет действует на весь остаток урока, включая автоматические повторные попытки. Готовые части сохраняются.',
    maximum: 'Максимум дополнительных кредитов',
    stageOutput: 'Примерный лимит токенов ответа на этап',
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
