import { Agent } from '@mastra/core/agent';
import { noopLogger } from '@mastra/core/logger';
import type { MastraModelConfig } from '@mastra/core/llm';
import { getLocalPrompt } from '@languon/prompts';
import type { z } from 'zod';

/** Single-step, operation-bound primitives; development wiring injects synthetic authority. */
export function createTutorRequestAgents(options: {
    planningModel: MastraModelConfig;
    authoringModel: MastraModelConfig;
}) {
    const create = (
        id: string,
        model: MastraModelConfig,
        instructions: string,
    ) => {
        const agent = new Agent({
            id,
            name: id,
            model,
            instructions,
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
            getLocalPrompt('tutor-request-resolution'),
        ),
        learningContentAuthor: create(
            'learning-content-author',
            options.authoringModel,
            getLocalPrompt('learning-content-authoring'),
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
            error.name === 'AI_NoObjectGeneratedError'
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
