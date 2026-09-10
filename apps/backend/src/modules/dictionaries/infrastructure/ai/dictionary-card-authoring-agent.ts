import { getLocalPrompt } from '@languon/prompts';
import { Agent } from '@mastra/core/agent';
import type {
    ModelRouterModelId,
    OpenAICompatibleConfig,
} from '@mastra/core/llm';

export interface DictionaryCardAuthoringAgentOptions {
    model: ModelRouterModelId | OpenAICompatibleConfig;
}

export function createDictionaryCardAuthoringAgent(
    options: DictionaryCardAuthoringAgentOptions,
) {
    return new Agent({
        defaultGenerateOptionsLegacy: { maxRetries: 0, maxSteps: 1 },
        defaultOptions: { maxSteps: 1 },
        defaultStreamOptionsLegacy: { maxRetries: 0, maxSteps: 1 },
        id: 'dictionary-card-authoring-agent',
        name: 'Dictionary card authoring agent',
        instructions: getLocalPrompt('dictionary-card-authoring-agent'),
        model: options.model,
    });
}

export type DictionaryCardAuthoringAgent = ReturnType<
    typeof createDictionaryCardAuthoringAgent
>;
