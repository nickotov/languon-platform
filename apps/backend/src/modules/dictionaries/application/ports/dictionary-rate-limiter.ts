export interface DictionaryRateLimitResult {
    allowed: boolean;
    retryAfterSeconds?: number;
}

export interface DictionaryRateLimiter {
    consume(input: {
        key: string;
        scope:
            | 'card-write'
            | 'fork-global'
            | 'fork-owner'
            | 'generation-enqueue'
            | 'import-preview-global'
            | 'import-preview-owner'
            | 'owner'
            | 'public'
            | 'shared-read';
        signal: AbortSignal;
    }): Promise<DictionaryRateLimitResult>;
}

export class AllowAllDictionaryRateLimiter implements DictionaryRateLimiter {
    public async consume(): Promise<DictionaryRateLimitResult> {
        return { allowed: true };
    }
}
