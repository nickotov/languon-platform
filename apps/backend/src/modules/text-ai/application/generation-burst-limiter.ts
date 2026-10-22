export type GenerationBurstCapability =
    'text-detection' | 'text-translation' | 'speech-prepare' | 'speech-confirm';

/** Admission-only guard; durable feature stores retain idempotency authority. */
export interface GenerationBurstLimiter {
    consume(input: {
        actorId: string;
        capability: GenerationBurstCapability;
        signal?: AbortSignal;
    }): Promise<{ allowed: boolean }>;
}

export class GenerationBurstUnavailableError extends Error {
    constructor() {
        super('Generation admission limiting is unavailable.');
        this.name = 'GenerationBurstUnavailableError';
    }
}

/** Worker-only compositions must never expose an unguarded admission service. */
export class UnavailableGenerationBurstLimiter implements GenerationBurstLimiter {
    async consume(): Promise<{ allowed: boolean }> {
        throw new GenerationBurstUnavailableError();
    }
}
