import { getLocalPrompt } from '@languon/prompts';
import { Agent } from '@mastra/core/agent';
import type {
    ModelRouterModelId,
    OpenAICompatibleConfig,
} from '@mastra/core/llm';

export interface DictionaryPastedTermsGenerationAgentOptions {
    model: ModelRouterModelId | OpenAICompatibleConfig;
}

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
        id: 'dictionary-pasted-terms-generation-agent',
        name: 'Dictionary pasted terms generation agent',
        instructions: getLocalPrompt(
            'dictionary-pasted-terms-generation-agent',
        ),
        model: options.model,
    });
}

export type DictionaryPastedTermsGenerationAgent = ReturnType<
    typeof createDictionaryPastedTermsGenerationAgent
>;
