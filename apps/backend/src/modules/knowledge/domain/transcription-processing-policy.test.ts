import { describe, expect, it } from 'vitest';
import {
    isApprovedTranscriptionProcessingRevision,
    KNOWLEDGE_TRANSCRIPTION_PROCESSING_POLICY,
    TRANSCRIPTION_DATA_SHARING_ATTESTATION_MS,
} from './transcription-processing-policy';

describe('Code-owned private audio engineering review', () => {
    it('recognizes only the reviewed technical route without claiming account or contractual approval', () => {
        expect(KNOWLEDGE_TRANSCRIPTION_PROCESSING_POLICY.status).toBe(
            'engineering-reviewed',
        );
        expect(
            isApprovedTranscriptionProcessingRevision(
                KNOWLEDGE_TRANSCRIPTION_PROCESSING_POLICY.approvedRevision,
            ),
        ).toBe(true);
        for (const revision of [
            null,
            undefined,
            '',
            'approved',
            'synthetic-reviewed-processing:v1',
            'openai:gpt-transcribe:v1',
        ])
            expect(isApprovedTranscriptionProcessingRevision(revision)).toBe(
                false,
            );
        expect(KNOWLEDGE_TRANSCRIPTION_PROCESSING_POLICY.residency).toBe(
            'global-endpoint-no-regional-guarantee',
        );
        expect(
            KNOWLEDGE_TRANSCRIPTION_PROCESSING_POLICY.zeroDataRetention,
        ).toBe('eligible-only-no-account-entitlement-claimed');
        expect(TRANSCRIPTION_DATA_SHARING_ATTESTATION_MS).toBe(
            30 * 24 * 60 * 60_000,
        );
    });
});
