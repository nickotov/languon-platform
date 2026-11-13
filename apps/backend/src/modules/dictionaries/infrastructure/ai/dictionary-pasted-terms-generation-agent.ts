import { getLocalPrompt } from '@languon/prompts';
import { Agent } from '@mastra/core/agent';
import type {
    ModelRouterModelId,
    OpenAICompatibleConfig,
    ModelRouterLanguageModel,
} from '@mastra/core/llm';

export interface DictionaryPastedTermsGenerationAgentOptions {
    model:
        ModelRouterModelId | OpenAICompatibleConfig | ModelRouterLanguageModel;
}

export const DictionaryPastedTermsGenerationAgentDefinition = {
    id: 'dictionary-pasted-terms-generation-agent',
    name: 'Dictionary pasted terms generation agent',
    instructions: getLocalPrompt('dictionary-pasted-terms-generation-agent'),
};

export function createDictionaryPastedTermsGenerationAgent(
    options: DictionaryPastedTermsGenerationAgentOptions,
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
        ...DictionaryPastedTermsGenerationAgentDefinition,

        model: options.model,
    });
}

export type DictionaryPastedTermsGenerationAgent = ReturnType<
    typeof createDictionaryPastedTermsGenerationAgent
>;
