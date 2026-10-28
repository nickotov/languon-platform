import type { AudioBytes } from './audio-object-storage';
import type { ProviderNativeUsage } from '@languon/contracts';
import type { SpeechNativeBillingDefinition } from '../../domain/speech-models';

/** Observed provider facts are captured by adapters, never supplied by a learner. */
export interface SpeechProviderObservation {
    usage?: ProviderNativeUsage;
    execution?: { endpointId?: string; serviceTier?: string };
}

export type SpeechNativeUsageBounds =
    SpeechNativeBillingDefinition['usageBounds'];

export interface SpeechProfile {
    configurationId: string;
    provider: string;
    model: string;
    voice: string;
    language: string;
    settingsVersion: string;
    estimatedCostUnitsPerCharacter: number;
    /** A reviewed provider-task bound is required before token-billed dispatch. */
    nativeBilling?: SpeechNativeBillingDefinition;
}

export type SpeechSynthesisResult =
    | { state: 'pending'; taskId: string; retryAfterMs: number }
    | ({ state: 'ready'; audio: AudioBytes } & SpeechProviderObservation);

export interface SpeechSynthesisProvider {
    readonly configurationId: string;
    supports(language: string): SpeechProfile | null;
    submit(input: {
        text: string;
        profile: SpeechProfile;
        requestId: string;
        signal?: AbortSignal;
    }): Promise<SpeechSynthesisResult>;
    poll(input: {
        taskId: string;
        profile: SpeechProfile;
        signal?: AbortSignal;
    }): Promise<SpeechSynthesisResult>;
}

export class SpeechSubmissionError extends Error {
    constructor(
        public readonly outcome: 'not_submitted' | 'unknown',
        public readonly retryable: boolean,
    ) {
        super('Speech submission failed.');
        this.name = 'SpeechSubmissionError';
    }
}

export class SpeechTaskFailedError extends Error {
    constructor(
        public readonly reason:
            'generation_failed' | 'provider_unavailable' = 'generation_failed',
        public readonly observation?: SpeechProviderObservation,
    ) {
        super('Speech task failed.');
        this.name = 'SpeechTaskFailedError';
    }
}

/** A billed task can have temporarily unavailable or invalid audio output. */
export class SpeechOutputUnavailableError extends Error {
    constructor(public readonly observation: SpeechProviderObservation) {
        super('Speech output is unavailable.');
        this.name = 'SpeechOutputUnavailableError';
    }
}
