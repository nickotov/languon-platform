import { Agent } from '@mastra/core/agent';
import { noopLogger } from '@mastra/core/logger';
import type {
    ModelRouterModelId,
    OpenAICompatibleConfig,
    ModelRouterLanguageModel,
} from '@mastra/core/llm';
import { getLocalPrompt } from '@languon/prompts';
/** Runtime-only primitives: user content requires authenticated durable jobs and accounting. */
export function createTextsAgents(options: {
    model:
        ModelRouterModelId | OpenAICompatibleConfig | ModelRouterLanguageModel;
}) {
    const create = (id: 'text-translation-agent' | 'text-detection-agent') => {
        const agent = new Agent({
            id,
            name: id,
            instructions: getLocalPrompt(id),
            model: options.model,
            defaultGenerateOptionsLegacy: { maxRetries: 0, maxSteps: 1 },
            defaultStreamOptionsLegacy: { maxRetries: 0, maxSteps: 1 },
            defaultOptions: { maxSteps: 1 },
        });
        agent.__registerPrimitives({ logger: noopLogger });
        return agent;
    };
    return {
        textTranslationAgent: create('text-translation-agent'),
        textDetectionAgent: create('text-detection-agent'),
    };
}
