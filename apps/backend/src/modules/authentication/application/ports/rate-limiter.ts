export interface RateLimitRequest {
    limit: number;
    resolveSubjectAlias?: boolean;
    scope: string;
    signal?: AbortSignal;
    subject: string;
    windowMs: number;
}

export interface RateLimitSubjectLink {
    alias: string;
    scope: string;
    signal?: AbortSignal;
    subject: string;
    ttlMs: number;
}

export interface RateLimitDecision {
    allowed: boolean;
    limit: number;
    remaining: number;
    retryAfterSeconds: number;
}

export interface RateLimiter {
    consume(request: RateLimitRequest): Promise<RateLimitDecision>;
    linkSubject(input: RateLimitSubjectLink): Promise<void>;
}

export class RateLimitUnavailableError extends Error {
    public constructor() {
        super('Authentication rate limiting is unavailable.');
        this.name = 'RateLimitUnavailableError';
    }
}
