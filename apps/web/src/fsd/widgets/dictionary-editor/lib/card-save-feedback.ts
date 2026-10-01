import {
    DictionaryApiError,
    dictionaryErrorMessage,
} from '@/fsd/entities/dictionary';
import { CardAutoSaveError } from './card-auto-save';

export function cardSaveFeedback(
    error: unknown,
    t: Parameters<typeof dictionaryErrorMessage>[1],
) {
    const cause = error instanceof CardAutoSaveError ? error.cause : error;
    const conflict =
        cause instanceof DictionaryApiError &&
        cause.detail.code === 'version_conflict';
    const message =
        error instanceof CardAutoSaveError && error.saved && !conflict
            ? t('dictionary.card.ai.savedRefreshFailed')
            : cause
              ? dictionaryErrorMessage(cause, t)
              : null;
    return { conflict, message };
}
