export interface CardAuthoringIdempotencyAttempt {
    fingerprint: string;
    key: string;
}

export function retainCardAuthoringIdempotencyAttempt(
    current: CardAuthoringIdempotencyAttempt | null,
    fingerprint: string,
    createKey: () => string = () => crypto.randomUUID(),
): CardAuthoringIdempotencyAttempt {
    return current?.fingerprint === fingerprint
        ? current
        : { fingerprint, key: createKey() };
}
