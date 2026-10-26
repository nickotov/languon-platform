import type {
    TextAiPreferenceResponse,
    UpdateTextAiPreferenceRequest,
} from '@languon/contracts';
import {
    TextAiModelUnavailableError,
    TextAiPreferenceConflictError,
    type TextAiPreference,
    type TextAiPreferenceStore,
} from '../domain/text-ai-preference-store';

export class TextAiPreferenceService {
    public constructor(private readonly store: TextAiPreferenceStore) {}
    public models(userId: string, _at = new Date()) {
        return this.store.run(userId, async (session) => {
            await session.read();
            return { defaultModelId: null, models: [] };
        });
    }

    public get(
        userId: string,
        _at = new Date(),
    ): Promise<TextAiPreferenceResponse> {
        return this.store.run(userId, async (session) =>
            this.response(await session.read()),
        );
    }

    public update(
        userId: string,
        input: UpdateTextAiPreferenceRequest,
        at = new Date(),
    ): Promise<TextAiPreferenceResponse> {
        return this.store.run(userId, async (session) => {
            const current = await session.read();
            if (current.version !== input.expectedVersion)
                throw new TextAiPreferenceConflictError();
            // Learner requests cannot alter the server-owned routing policy.
            if (input.mode === 'explicit')
                throw new TextAiModelUnavailableError();
            const preference: TextAiPreference = {
                mode: 'auto',
                modelId: null,
                version: current.version + 1,
                maxCreditsPerAction:
                    input.maxCreditsPerAction ??
                    current.maxCreditsPerAction ??
                    null,
            };
            await session.save(preference, at);
            return this.response(preference);
        });
    }
    private response(preference: TextAiPreference): TextAiPreferenceResponse {
        return {
            mode: 'auto',
            modelId: null,
            selectedModel: null,
            version: preference.version,
            maxCreditsPerAction: preference.maxCreditsPerAction ?? null,
        };
    }
}
