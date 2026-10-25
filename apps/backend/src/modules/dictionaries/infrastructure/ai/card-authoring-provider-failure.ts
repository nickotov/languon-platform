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

export interface CardAuthoringProviderFailure {
    errorName: string;
    runId?: string;
    httpStatus?: number;
    transportCode?: string;
}

/** Provider errors may contain prompts, authorization headers and response bodies. */
export function cardAuthoringProviderFailure(
    error: unknown,
    idempotencyKey: string,
): CardAuthoringProviderFailure {
    const runId =
        /^([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})(?:\/generate)?$/i.exec(
            idempotencyKey,
        )?.[1];
    const result: CardAuthoringProviderFailure = {
        errorName: 'UnknownError',
        ...(runId ? { runId } : {}),
    };
    let current = error;
    for (let depth = 0; depth < 3; depth += 1) {
        if (!current || typeof current !== 'object') break;
        const detail = current as Record<string, unknown>;
        if (
            depth === 0 &&
            typeof detail.name === 'string' &&
            errorNames.has(detail.name)
        )
            result.errorName = detail.name;
        if (
            typeof detail.statusCode === 'number' &&
            Number.isInteger(detail.statusCode) &&
            detail.statusCode >= 100 &&
            detail.statusCode <= 599
        )
            result.httpStatus ??= detail.statusCode;
        if (typeof detail.code === 'string' && transportCodes.has(detail.code))
            result.transportCode ??= detail.code;
        current = detail.cause;
    }
    return result;
}
