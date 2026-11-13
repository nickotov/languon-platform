import { Agent } from '@mastra/core/agent';
import { noopLogger } from '@mastra/core/logger';
import type {
    ModelRouterModelId,
    OpenAICompatibleConfig,
    ModelRouterLanguageModel,
} from '@mastra/core/llm';
import { getLocalPrompt } from '@languon/prompts';
/** Canonical static definition reused by runtime construction and metadata inspection. */
export function sentenceAgentDefinition(
    id: 'sentence-generation-agent' | 'sentence-check-agent',
) {
    return { id, name: id, instructions: getLocalPrompt(id) };
}

export function createSentenceAgents(options: {
    model:
        ModelRouterModelId | OpenAICompatibleConfig | ModelRouterLanguageModel;
}) {
    const create = (
        id: 'sentence-generation-agent' | 'sentence-check-agent',
    ) => {
        const agent = new Agent({
            ...sentenceAgentDefinition(id),
            model: options.model,
            defaultGenerateOptionsLegacy: { maxRetries: 0, maxSteps: 1 },
            defaultStreamOptionsLegacy: { maxRetries: 0, maxSteps: 1 },
            defaultOptions: { maxSteps: 1 },
        });

        agent.__registerPrimitives({ logger: noopLogger });

        return agent;
    };

    return {
        sentenceGenerationAgent: create('sentence-generation-agent'),
        sentenceCheckAgent: create('sentence-check-agent'),
    };
}
