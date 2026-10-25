import { z } from 'zod';

const errorNames = new Set([
    'Error',
    'TypeError',
    'AbortError',
    'AI_APICallError',
    'AI_RetryError',
    'AI_NoObjectGeneratedError',
]);
const transportCodes = new Set([
    'ENOTFOUND',
    'ECONNREFUSED',
    'ECONNRESET',
    'ETIMEDOUT',
    'EAI_AGAIN',
    'UND_ERR_CONNECT_TIMEOUT',
    'UND_ERR_HEADERS_TIMEOUT',
    'CERT_HAS_EXPIRED',
    'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
]);
const kieErrorEnvelope = z.object({ code: z.number().int().min(400).max(599) });

export type SentenceProviderFailureReason =
    | 'model_retired'
    | 'model_unavailable'
    | 'authorization_failed'
    | 'provider_credits_exhausted'
    | 'rate_limited'
    | 'provider_unavailable';

export interface SentenceProviderFailure {
    reason: SentenceProviderFailureReason;
    httpStatus?: number;
    providerCode?: number;
    transportCode?: string;
    errorName?: string;
}

function field(value: object, key: string): unknown {
    try {
        return (value as Record<string, unknown>)[key];
    } catch {
        return undefined;
    }
}

function status(value: unknown): number | undefined {
    return typeof value === 'number' &&
        Number.isInteger(value) &&
        value >= 100 &&
        value <= 599
        ? value
        : undefined;
}

function kieCode(body: unknown): number | undefined {
    if (typeof body !== 'string' || body.length > 16_384) return undefined;

    try {
        const envelope = kieErrorEnvelope.safeParse(JSON.parse(body));
        return envelope.success ? envelope.data.code : undefined;
    } catch {
        return undefined;
    }
}

function reason(code: number | undefined): SentenceProviderFailureReason {
    switch (code) {
        case 410:
            return 'model_retired';
        case 404:
            return 'model_unavailable';
        case 401:
        case 403:
            return 'authorization_failed';
        case 402:
            return 'provider_credits_exhausted';
        case 429:
            return 'rate_limited';
        default:
            return 'provider_unavailable';
    }
}

/** Never return provider messages, prompts, headers, or response bodies. */
export function sentenceProviderFailure(
    error: unknown,
    providerId: string,
): SentenceProviderFailure {
    const result: SentenceProviderFailure = { reason: 'provider_unavailable' };
    let current = error;

    for (let depth = 0; depth < 3; depth += 1) {
        if (!current || typeof current !== 'object') break;

        const name = field(current, 'name');
        if (typeof name === 'string' && errorNames.has(name))
            result.errorName ??= name;

        const httpStatus = status(field(current, 'statusCode'));
        if (
            httpStatus !== undefined &&
            (result.httpStatus === undefined ||
                (result.httpStatus < 400 && httpStatus >= 400))
        )
            result.httpStatus = httpStatus;

        const code = field(current, 'code');
        if (typeof code === 'string' && transportCodes.has(code))
            result.transportCode ??= code;

        if (providerId === 'kie') {
            const providerCode = kieCode(field(current, 'responseBody'));
            if (providerCode !== undefined)
                result.providerCode ??= providerCode;
        }

        current = field(current, 'cause');
    }

    result.reason = reason(result.providerCode ?? result.httpStatus);
    return result;
}
