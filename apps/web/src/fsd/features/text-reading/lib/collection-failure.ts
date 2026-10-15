export function collectionFailureKey(code: string | null) {
    switch (code) {
        case 'ai_credits_exhausted':
            return 'texts.collect.credits';
        case 'provider_unavailable':
        case 'generation_not_available':
        case 'service_unavailable':
            return 'texts.collect.unavailable';
        case 'stale_content':
        case 'version_conflict':
        case 'language_pair_mismatch':
            return 'texts.collect.changed';
        case 'access_revoked':
        case 'not_found':
        case 'text_not_found':
        case 'shared_text_not_found':
            return 'texts.collect.revoked';
        case 'generation_proposal_expired':
            return 'texts.collect.expired';
        default:
            return 'texts.collect.error';
    }
}
