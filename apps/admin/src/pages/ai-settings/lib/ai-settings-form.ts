import type {
    AiProviderOption,
    AiSettingsFormValues,
    AiSettingsMutationRequest,
    AiSettingsResponse,
} from '../types';

export function settingsToFormValues(
    response: AiSettingsResponse,
): AiSettingsFormValues {
    return {
        activeProvider: response.settings.activeProvider ?? undefined,
        defaultModel: response.settings.defaultModel ?? undefined,
        enabledModels: response.settings.enabledModels,
        reason: '',
    };
}

export function enabledDefaultModels(
    providers: AiProviderOption[],
    activeProvider: string | undefined,
    enabledModels: string[],
) {
    const activeProviderOption = providers.find(
        (provider) => provider.id === activeProvider,
    );
    return (
        activeProviderOption?.models.filter(
            (model) => enabledModels.includes(model.id) && model.available,
        ) ?? []
    );
}

export function toMutationRequest(
    values: AiSettingsFormValues,
    expectedVersion: number,
): AiSettingsMutationRequest {
    if (!values.activeProvider || !values.defaultModel) {
        throw new Error('Provider and default model are required.');
    }
    return {
        activeProvider: values.activeProvider as 'deepseek' | 'kie',
        defaultModel: values.defaultModel,
        enabledModels: values.enabledModels,
        expectedVersion,
        reason: values.reason.trim(),
    };
}
