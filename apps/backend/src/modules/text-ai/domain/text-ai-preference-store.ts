import type { TextAiModelsResponse } from '@languon/contracts';

export interface TextAiPreference {
    mode: 'auto' | 'explicit';
    modelId: string | null;
    version: number;
}
export interface TextAiPreferenceSession {
    read(): Promise<TextAiPreference>;
    /** Explicit choices require selection-capable workers; Auto preserves legacy readiness. */
    catalog(
        at: Date,
        mode?: TextAiPreference['mode'],
    ): Promise<TextAiModelsResponse>;
    save(preference: TextAiPreference, at: Date): Promise<void>;
}
export interface TextAiPreferenceStore {
    /** Locks the active user and serializes preference writes with lifecycle changes. */
    run<T>(
        userId: string,
        work: (session: TextAiPreferenceSession) => Promise<T>,
    ): Promise<T>;
}
export class TextAiUserUnavailableError extends Error {}
export class TextAiPreferenceConflictError extends Error {}
export class TextAiModelUnavailableError extends Error {
    public constructor() {
        super(
            'This model is unavailable. Choose another enabled model or Auto.',
        );
    }
}
