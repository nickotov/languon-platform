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
    public models(userId: string, at = new Date()) {
        return this.store.run(userId, (session) => session.catalog(at));
    }
    public get(
        userId: string,
        at = new Date(),
    ): Promise<TextAiPreferenceResponse> {
        return this.store.run(userId, async (session) => {
            const preference = await session.read();
            const catalog = await session.catalog(at, preference.mode);
            return this.response(preference, catalog);
        });
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
            const catalog = await session.catalog(at, input.mode);
            if (
                input.mode === 'explicit' &&
                !catalog.models.some(
                    (model) =>
                        model.id === input.modelId &&
                        model.availability === 'available',
                )
            ) {
                throw new TextAiModelUnavailableError();
            }
            const preference: TextAiPreference = {
                mode: input.mode,
                modelId: input.mode === 'explicit' ? input.modelId : null,
                version: current.version + 1,
                maxCreditsPerAction:
                    input.maxCreditsPerAction ??
                    current.maxCreditsPerAction ??
                    null,
            };
            await session.save(preference, at);
            return this.response(preference, catalog);
        });
    }
    private response(
        preference: TextAiPreference,
        catalog: Awaited<ReturnType<TextAiPreferenceService['models']>>,
    ): TextAiPreferenceResponse {
        const selectedId =
            preference.mode === 'auto'
                ? catalog.defaultModelId
                : preference.modelId;
        return {
            ...preference,
            maxCreditsPerAction: preference.maxCreditsPerAction ?? null,
            selectedModel:
                catalog.models.find((model) => model.id === selectedId) ?? null,
        };
    }
}
