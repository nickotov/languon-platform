export type {
    AdminAiSettingsMutationRequest as AiSettingsMutationRequest,
    AdminAiSettingsResponse as AiSettingsResponse,
} from '@languon/contracts';

import type { AdminAiSettingsResponse } from '@languon/contracts';

export type AiModelOption =
    AdminAiSettingsResponse['providers'][number]['models'][number];
export type AiProviderOption = AdminAiSettingsResponse['providers'][number];

export interface AiSettingsFormValues {
    activeProvider?: string | undefined;
    defaultModel?: string | undefined;
    enabledModels: string[];
    reason: string;
}
