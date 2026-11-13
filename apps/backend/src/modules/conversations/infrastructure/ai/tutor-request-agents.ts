import { Agent } from '@mastra/core/agent';
import { noopLogger } from '@mastra/core/logger';
import type { MastraModelConfig } from '@mastra/core/llm';
import { getLocalPrompt } from '@languon/prompts';
import { z } from 'zod';

export const tutorRequestAgentDefinitions = {
    'tutor-request-resolver': {
        id: 'tutor-request-resolver',
        name: 'tutor-request-resolver',
        instructions: getLocalPrompt('tutor-request-resolution'),
    },
    'dictionary-snippet-author': {
        id: 'dictionary-snippet-author',
        name: 'dictionary-snippet-author',
        instructions: getLocalPrompt('dictionary-chat-snippet-authoring'),
    },
    'learning-content-author': {
        id: 'learning-content-author',
        name: 'learning-content-author',
        instructions: getLocalPrompt('learning-content-authoring'),
    },
};

/** Single-step, operation-bound primitives; development wiring injects synthetic authority. */
export function createTutorRequestAgents(options: {
    planningModel: MastraModelConfig;
    authoringModel: MastraModelConfig;
}) {
    const create = (
        id: keyof typeof tutorRequestAgentDefinitions,
        model: MastraModelConfig,
    ) => {
        const agent = new Agent({
            ...tutorRequestAgentDefinitions[id],
            model,
            defaultOptions: { maxSteps: 1 },
            defaultGenerateOptionsLegacy: { maxSteps: 1, maxRetries: 0 },
            defaultStreamOptionsLegacy: { maxSteps: 1, maxRetries: 0 },
        });

        agent.__registerPrimitives({ logger: noopLogger });

        return agent;
    };

    return {
        tutorRequestResolver: create(
            'tutor-request-resolver',
            options.planningModel,
        ),
        dictionarySnippetAuthor: create(
            'dictionary-snippet-author',
            options.authoringModel,
        ),
        learningContentAuthor: create(
            'learning-content-author',
            options.authoringModel,
        ),
    };
}

export async function generateTutorObject(input: {
    agent: Agent;
    prompt: string;
    schema: z.ZodType;
    signal: AbortSignal;
    operationId: string;
    maxOutputTokens: number;
}) {
    let result;
    try {
        result = await input.agent.generate(input.prompt, {
            runId: input.operationId,
            abortSignal: input.signal,
            maxSteps: 1,
            toolChoice: 'none',
            modelSettings: {
                maxRetries: 0,
                maxOutputTokens: input.maxOutputTokens,
            },
            structuredOutput: {
                schema: input.schema,
                jsonPromptInjection: 'inline',
            },
            tracingOptions: { hideInput: true, hideOutput: true },
        });
    } catch (error) {
        // A completed schema-invalid response is eligible for the author's one repair;
        // transport errors and ambiguous submissions are never redispatched here.
        if (
            error instanceof Error &&
            (error.name === 'AI_NoObjectGeneratedError' ||
                (error.name === 'Error' && error.cause instanceof z.ZodError))
        ) {
            input.signal.throwIfAborted();

            return null;
        }

        throw error;
    }

    input.signal.throwIfAborted();
    if (result.error || result.tripwire || result.finishReason === 'length') {
        throw new Error(
            'The learning request could not be completed within its limits.',
        );
    }

    return result.object;
}
