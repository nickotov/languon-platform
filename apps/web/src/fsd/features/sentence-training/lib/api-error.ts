import { ActionConsentCancelledError } from '@/fsd/entities/ai-action';
import { BrowserApiError } from '@languon/browser-auth';
import type {
    SentenceErrorCode,
    SentenceErrorResponse,
} from '@languon/contracts';

export class ApiError extends BrowserApiError<SentenceErrorResponse['error']> {
    public override readonly name = 'SentenceApiError';
    public readonly retryAt: number | undefined;
    public constructor(status: number, detail: SentenceErrorResponse['error']) {
        super(status, detail);
        this.retryAt = detail.retryAfterSeconds
            ? Date.now() + detail.retryAfterSeconds * 1000
            : undefined;
    }
    public get code(): SentenceErrorCode | 'network_timeout' {
        return this.status === 0 ? 'network_timeout' : this.detail.code;
    }
    public get retryAfterSeconds(): number | undefined {
        return this.detail.retryAfterSeconds;
    }
}
export function toApiError(error: unknown): ApiError {
    if (error instanceof ActionConsentCancelledError)
        return new ApiError(409, {
            code: 'action_confirmation_required',
            correlationId: 'client-budget-cancelled',
            message: error.message,
        });
    if (error instanceof ApiError) return error;
    return new ApiError(error instanceof BrowserApiError ? error.status : 0, {
        code:
            error instanceof BrowserApiError && error.status === 401
                ? 'authentication_required'
                : 'service_unavailable',
        correlationId: 'client-session',
        message:
            'The request could not be confirmed. Retry to recover its result.',
    });
}
export function isAccessLoss(error: ApiError): boolean {
    return [
        'authentication_required',
        'email_verification_required',
        'dictionary_not_found',
        'shared_dictionary_not_found',
        'entry_not_found',
        'job_not_found',
        'feature_disabled',
    ].includes(error.code);
}
export function isUncertain(error: ApiError): boolean {
    return (
        error.status === 0 ||
        (error.status >= 500 &&
            ['service_unavailable', 'internal_error'].includes(error.code))
    );
}
