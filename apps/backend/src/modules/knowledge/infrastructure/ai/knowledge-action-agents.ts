import { Agent } from '@mastra/core/agent';
import { noopLogger } from '@mastra/core/logger';
import type {
    ModelRouterModelId,
    OpenAICompatibleConfig,
    ModelRouterLanguageModel,
} from '@mastra/core/llm';
import { getLocalPrompt } from '@languon/prompts';

/** Canonical static definition reused by runtime construction and metadata inspection. */
export function knowledgeActionAgentDefinition(
    id: 'knowledge-block-field-agent' | 'knowledge-exercise-evaluation-agent',
) {
    return { id, name: id, instructions: getLocalPrompt(id) };
}

/** These specialists run only inside an authenticated, admitted knowledge action. */
export function createKnowledgeActionAgents(options: {
    model:
        ModelRouterModelId | OpenAICompatibleConfig | ModelRouterLanguageModel;
}) {
    const create = (
        id:
            | 'knowledge-block-field-agent'
            | 'knowledge-exercise-evaluation-agent',
    ) => {
        const agent = new Agent({
            ...knowledgeActionAgentDefinition(id),
            model: options.model,
            defaultGenerateOptionsLegacy: { maxRetries: 0, maxSteps: 1 },
            defaultStreamOptionsLegacy: { maxRetries: 0, maxSteps: 1 },
            defaultOptions: { maxSteps: 1 },
        });

        agent.__registerPrimitives({ logger: noopLogger });

        return agent;
    };

    return {
        knowledgeBlockFieldAgent: create('knowledge-block-field-agent'),
        knowledgeExerciseEvaluationAgent: create(
            'knowledge-exercise-evaluation-agent',
        ),
    };
}
