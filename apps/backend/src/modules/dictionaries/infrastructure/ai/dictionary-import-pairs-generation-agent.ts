import { getLocalPrompt } from '@languon/prompts';
import { Agent } from '@mastra/core/agent';
import type {
    ModelRouterModelId,
    OpenAICompatibleConfig,
} from '@mastra/core/llm';

export function createDictionaryImportPairsGenerationAgent(options: {
    model: ModelRouterModelId | OpenAICompatibleConfig;
}) {
    return new Agent({
        defaultGenerateOptionsLegacy: { maxRetries: 0, maxSteps: 1 },
        defaultOptions: { maxSteps: 1 },
        defaultStreamOptionsLegacy: { maxRetries: 0, maxSteps: 1 },
        id: 'dictionary-import-pairs-generation-agent',
        name: 'Dictionary import pairs generation agent',
        instructions: getLocalPrompt(
            'dictionary-import-pairs-generation-agent',
        ),
        model: options.model,
    });
}

export type DictionaryImportPairsGenerationAgent = ReturnType<
    typeof createDictionaryImportPairsGenerationAgent
>;
