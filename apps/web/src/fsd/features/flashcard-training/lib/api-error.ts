import { BrowserApiError } from '@languon/browser-auth';
import type {
    LearningErrorCode,
    LearningErrorResponse,
} from '@languon/contracts';

export class ApiError extends BrowserApiError<LearningErrorResponse['error']> {
    public override readonly name = 'LearningApiError';
    public readonly retryAt: number | undefined;
    public constructor(status: number, detail: LearningErrorResponse['error']) {
        super(status, detail);
        this.retryAt = detail.retryAfterSeconds
            ? Date.now() + detail.retryAfterSeconds * 1000
            : undefined;
    }
    public get code(): LearningErrorCode | 'network_timeout' {
        return this.status === 0 ? 'network_timeout' : this.detail.code;
    }
    public get retryAfterSeconds(): number | undefined {
        return this.detail.retryAfterSeconds;
    }
}

export function toApiError(error: unknown): ApiError {
    if (error instanceof ApiError) return error;
    if (error instanceof BrowserApiError) {
        return new ApiError(error.status, {
            code:
                error.status === 401
                    ? 'authentication_required'
                    : 'service_unavailable',
            correlationId: 'client-session',
            message: 'The request could not be completed.',
        });
    }
    return new ApiError(0, {
        code: 'service_unavailable',
        correlationId: 'client-network',
        message:
            'The request could not be confirmed. Retry the same operation.',
    });
}

export function isAccessLoss(error: ApiError): boolean {
    return [
        'authentication_required',
        'dictionary_not_found',
        'shared_dictionary_not_found',
    ].includes(error.code);
}

export function retryAtFor(error: ApiError): number | undefined {
    return error.retryAt;
}
