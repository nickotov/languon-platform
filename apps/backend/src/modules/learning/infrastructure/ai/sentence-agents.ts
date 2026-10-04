import { Agent } from '@mastra/core/agent';
import type {
    ModelRouterModelId,
    OpenAICompatibleConfig,
} from '@mastra/core/llm';
import { getLocalPrompt } from '@languon/prompts';
export function createSentenceAgents(options: {
    model: ModelRouterModelId | OpenAICompatibleConfig;
}) {
    const create = (id: 'sentence-generation-agent' | 'sentence-check-agent') =>
        new Agent({
            id,
            name: id,
            instructions: getLocalPrompt(id),
            model: options.model,
            defaultGenerateOptionsLegacy: { maxRetries: 0, maxSteps: 1 },
            defaultStreamOptionsLegacy: { maxRetries: 0, maxSteps: 1 },
            defaultOptions: { maxSteps: 1 },
        });
    return {
        sentenceGenerationAgent: create('sentence-generation-agent'),
        sentenceCheckAgent: create('sentence-check-agent'),
    };
}
