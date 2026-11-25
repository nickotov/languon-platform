import { createHmac } from 'node:crypto';

export const NORMALIZATION_REVISION = 'nfc-horizontal-whitespace-v1';
export const ELIGIBILITY_REVISION = 'intl-word-codepoint-v1';

export function normalizeSpeechText(text: string): string {
    return text
        .normalize('NFC')
        .replace(/\r\n|[\r\v\f\u0085\u2028\u2029]/gu, '\n')
        .replace(/[^\S\n]+/gu, ' ')
        .trim();
}

export function inspectSpeechText(text: string, language: string) {
    const normalized = normalizeSpeechText(text);
    const characterCount = [...normalized].length;
    const wordCount = [
        ...new Intl.Segmenter(language, { granularity: 'word' }).segment(
            normalized,
        ),
    ].filter((part) => part.isWordLike).length;

    return {
        normalized,
        characterCount,
        wordCount,
        free: wordCount <= 10 && characterCount <= 100,
    };
}

export function speechTextIdentity(
    secret: string,
    language: string,
    normalized: string,
    recordingClass: 'fixture' | 'pronunciation',
): string {
    return createHmac('sha256', secret)
        .update(
            JSON.stringify([
                NORMALIZATION_REVISION,
                language,
                normalized,
                recordingClass,
            ]),
        )
        .digest('hex');
}

export { calculateSpeechPrice as speechPrice } from '../../ai-credits/domain/model-price';

const failureKinds = {
    admin_access_denied: 'forbidden',
    listening_authorization_expired: 'conflict',
    listening_authorization_required: 'conflict',
    listening_budget_exhausted: 'conflict',
    listening_script_invalid: 'conflict',
    rate_limited: 'capacity_limited',
    service_unavailable: 'unavailable',
    speech_admission_incomplete: 'conflict',
    speech_clock_unavailable: 'unavailable',
    speech_decoder_unavailable: 'unavailable',
    speech_delete_impact_changed: 'conflict',
    speech_duration_exceeded: 'conflict',
    speech_duration_invalid: 'conflict',
    speech_free_daily_limit: 'capacity_limited',
    speech_generation_unavailable: 'unavailable',
    speech_operation_conflict: 'conflict',
    speech_playback_unavailable: 'unavailable',
    speech_provider_budget: 'capacity_limited',
    speech_provider_unavailable: 'unavailable',
    speech_queue_limit: 'capacity_limited',
    speech_quote_expired: 'conflict',
    speech_quote_not_found: 'not_found',
    speech_quote_stale: 'conflict',
    speech_recording_not_found: 'not_found',
    speech_recording_unavailable: 'not_found',
    speech_reference_hidden: 'forbidden',
    speech_request_not_found: 'not_found',
    speech_source_changed: 'conflict',
    speech_source_forbidden: 'forbidden',
    speech_source_unavailable: 'not_found',
    speech_submission_unknown: 'conflict',
    speech_text_unavailable: 'invalid_input',
    speech_utterance_identity_invalid: 'conflict',
    speech_voice_unavailable: 'conflict',
} as const;

type SpeechFailureReason =
    keyof typeof failureKinds | { recordingFailure: string };
export type SpeechFailureKind =
    (typeof failureKinds)[keyof typeof failureKinds];

export class SpeechError extends Error {
    public readonly kind: SpeechFailureKind;
    public readonly code: string;

    public constructor(reason: SpeechFailureReason) {
        // Persisted recording failures carry the original public code on replay.
        const code =
            typeof reason === 'object'
                ? reason.recordingFailure
                : reason === 'speech_source_forbidden'
                  ? 'speech_source_unavailable'
                  : reason;

        super(code);
        this.name = 'SpeechError';
        this.code = code;
        this.kind =
            typeof reason === 'object' ? 'conflict' : failureKinds[reason];
    }
}
