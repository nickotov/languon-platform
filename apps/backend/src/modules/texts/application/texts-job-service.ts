import type {
    EnqueueTextDetectionRequest,
    EnqueueTextTranslationRequest,
} from '@languon/contracts';
import type { TextsJobStore } from './ports/texts-job-store';
import { TextsAiError } from './ports/texts-ai-provider';
import {
    GenerationBurstUnavailableError,
    type GenerationBurstLimiter,
    type GenerationBurstCapability,
} from '../../text-ai/application/generation-burst-limiter';
export interface TextsJobServiceDependencies {
    store: TextsJobStore;
    clock: { now(): Date };
    enabled: boolean;
    burstLimiter: GenerationBurstLimiter;
    authenticate(accessToken: string): Promise<{ userId: string }>;
}
export class TextsJobService {
    constructor(private readonly d: TextsJobServiceDependencies) {}
    private async owner(token: string | undefined) {
        if (!this.d.enabled) throw new TextsAiError('generation_not_available');
        if (!token) throw new TextsAiError('authentication_required');
        return (await this.d.authenticate(token)).userId;
    }
    private async admissionOwner(
        token: string | undefined,
        capability: GenerationBurstCapability,
        signal: AbortSignal,
    ) {
        const actorId = await this.owner(token);
        try {
            const decision = await this.d.burstLimiter.consume({
                actorId,
                capability,
                signal,
            });
            if (!decision.allowed) throw new TextsAiError('rate_limited');
        } catch (error) {
            if (error instanceof GenerationBurstUnavailableError)
                throw new TextsAiError('service_unavailable');
            throw error;
        }
        return actorId;
    }
    async detect(
        token: string | undefined,
        input: EnqueueTextDetectionRequest,
        signal: AbortSignal,
    ) {
        return this.d.store.enqueue(
            await this.admissionOwner(token, 'text-detection', signal),
            'text-detection',
            input,
            { now: this.d.clock.now(), signal },
        );
    }
    async translate(
        token: string | undefined,
        input: EnqueueTextTranslationRequest,
        signal: AbortSignal,
    ) {
        return this.d.store.enqueue(
            await this.admissionOwner(token, 'text-translation', signal),
            'text-translation',
            input,
            { now: this.d.clock.now(), signal },
        );
    }
    async get(token: string | undefined, id: string, signal: AbortSignal) {
        return this.d.store.get(await this.owner(token), id, {
            now: this.d.clock.now(),
            signal,
        });
    }
    async cancel(token: string | undefined, id: string, signal: AbortSignal) {
        return this.d.store.cancel(await this.owner(token), id, {
            now: this.d.clock.now(),
            signal,
        });
    }
}
