import type { AudioBytes } from './audio-object-storage';

export interface SpeechProfile {
    configurationId: string;
    provider: string;
    model: string;
    voice: string;
    language: string;
    settingsVersion: string;
    estimatedCostUnitsPerCharacter: number;
}

export type SpeechSynthesisResult =
    | { state: 'pending'; taskId: string; retryAfterMs: number }
    | { state: 'ready'; audio: AudioBytes };

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
    constructor() {
        super('Speech task failed.');
        this.name = 'SpeechTaskFailedError';
    }
}
