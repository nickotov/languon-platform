export interface IdempotencyAttempt {
    fingerprint: string;
    key: string;
}

export function retainIdempotencyAttempt(
    current: IdempotencyAttempt | null,
    fingerprint: string,
    createKey: () => string = () => crypto.randomUUID(),
): IdempotencyAttempt {
    return current?.fingerprint === fingerprint
        ? current
        : { fingerprint, key: createKey() };
}
