import type { DictionaryCardAuthoringGenerationJob } from '@languon/contracts';

import type { MessageKey } from '@/fsd/shared/i18n';

type AuthoringFailureCode = NonNullable<
    DictionaryCardAuthoringGenerationJob['failure']
>['code'];

export function cardAuthoringFailureMessageKey(
    code: AuthoringFailureCode | null | undefined,
): MessageKey {
    switch (code) {
        case 'ai_credits_exhausted':
            return 'dictionary.generation.error.creditsExhausted';
        case 'provider_rate_limited':
            return 'dictionary.authoring.rateLimited';
        case 'provider_unavailable':
            return 'dictionary.authoring.providerUnavailable';
        case 'provider_timeout':
            return 'dictionary.authoring.timeout';
        default:
            return 'dictionary.authoring.failed';
    }
}
