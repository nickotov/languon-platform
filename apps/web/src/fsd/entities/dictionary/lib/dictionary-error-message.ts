import type { Translate } from '@/fsd/shared/i18n';

import { DictionaryApiError } from '../api/dictionary-api';

export function dictionaryErrorMessage(error: unknown, t: Translate): string {
    if (!(error instanceof DictionaryApiError))
        return t('dictionary.error.generic');
    if (error.detail.code === 'version_conflict')
        return t('dictionary.error.conflict');
    if (error.detail.code === 'language_pair_locked')
        return t('dictionary.settings.pairLocked');
    if (error.detail.code === 'authentication_required')
        return t('dictionary.error.signIn');
    if (
        error.detail.code === 'owner_capacity_exceeded' ||
        error.detail.code === 'card_capacity_exceeded'
    )
        return t('dictionary.error.capacity');
    if (error.detail.code === 'generation_not_available')
        return t('dictionary.generation.error.unavailable');
    if (error.detail.code === 'generation_job_not_found')
        return t('dictionary.generation.error.notFound');
    if (error.detail.code === 'generation_not_reviewable')
        return t('dictionary.generation.error.notReviewable');
    if (error.detail.code === 'generation_proposal_expired')
        return t('dictionary.generation.error.expired');
    if (error.detail.code === 'generation_candidate_conflict')
        return t('dictionary.generation.error.candidateConflict');
    return t('dictionary.error.generic');
}
