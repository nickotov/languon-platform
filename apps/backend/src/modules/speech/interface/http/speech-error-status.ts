import type { SpeechFailureKind } from '../../domain/speech-policy';

export const speechErrorStatus = {
    invalid_input: 400,
    forbidden: 403,
    not_found: 404,
    conflict: 409,
    capacity_limited: 429,
    unavailable: 503,
} as const satisfies Record<SpeechFailureKind, number>;
