import { Agent } from '@mastra/core/agent';
import type {
    ModelRouterModelId,
    OpenAICompatibleConfig,
} from '@mastra/core/llm';
import { getLocalPrompt } from '@languon/prompts';

export interface DictionaryCardGenerationAgentOptions {
    model: ModelRouterModelId | OpenAICompatibleConfig;
}

export function createDictionaryCardGenerationAgent(
    options: DictionaryCardGenerationAgentOptions,
) {
    return new Agent({
        defaultGenerateOptionsLegacy: {
            maxRetries: 0,
            maxSteps: 1,
        },
        defaultOptions: { maxSteps: 1 },
        defaultStreamOptionsLegacy: {
            maxRetries: 0,
            maxSteps: 1,
        },
        id: 'dictionary-card-generation-agent',
        name: 'Dictionary card generation agent',
        instructions: getLocalPrompt('dictionary-card-generation-agent'),
        model: options.model,
    });
}

export type DictionaryCardGenerationAgent = ReturnType<
    typeof createDictionaryCardGenerationAgent
>;
