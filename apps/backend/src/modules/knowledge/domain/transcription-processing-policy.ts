import { KNOWLEDGE_TRANSCRIPTION_PROCESSING_REVISION } from '@languon/contracts';

/** Engineering review of the fixed route, not provider, legal, DPA or account approval. */
export const KNOWLEDGE_TRANSCRIPTION_PROCESSING_POLICY = {
    providerId: 'openai',
    modelId: 'gpt-transcribe',
    endpoint: 'https://api.openai.com/v1/audio/transcriptions',
    transport: 'direct-multipart-no-files-api-no-fallback',
    status: 'engineering-reviewed',
    approvedRevision: KNOWLEDGE_TRANSCRIPTION_PROCESSING_REVISION,
    reviewedAt: '2026-10-29',
    sourceUrl:
        'https://developers.openai.com/api/docs/guides/your-data#storage-requirements-and-retention-controls-per-endpoint',
    sourceSha256:
        '16e953514150dd5cbf2c599868ca14253c3b8d78cd7268e950a6f665418565ed',
    training: 'not-used-unless-organization-opts-in',
    abuseMonitoringRetention: 'endpoint-table-none-subject-to-provider-terms',
    applicationStateRetention: 'endpoint-table-none-subject-to-provider-terms',
    zeroDataRetention: 'eligible-only-no-account-entitlement-claimed',
    residency: 'global-endpoint-no-regional-guarantee',
    processorApproval:
        'engineering-route-review-only-no-contractual-approval-claimed',
} as const;

export const TRANSCRIPTION_DATA_SHARING_ATTESTATION_MS = 30 * 24 * 60 * 60_000;

export function isApprovedTranscriptionProcessingRevision(
    revision: string | null | undefined,
): boolean {
    return (
        revision === KNOWLEDGE_TRANSCRIPTION_PROCESSING_POLICY.approvedRevision
    );
}
