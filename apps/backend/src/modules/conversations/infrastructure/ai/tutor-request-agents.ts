import { Agent } from '@mastra/core/agent';
import { noopLogger } from '@mastra/core/logger';
import type { MastraModelConfig } from '@mastra/core/llm';
import { getLocalPrompt } from '@languon/prompts';
import type { z } from 'zod';
import {
    GenerationExecutionFailure,
    type GenerationFailureDiagnostic,
} from '../../application/generation-failure';
import {
    completedStructuredFailure,
    structuredFinishReason,
    type StructuredFinishReason,
} from './structured-output-diagnostics';

export const tutorRequestAgentDefinitions = {
    'generation-plan-reviser': {
        id: 'generation-plan-reviser',
        name: 'generation-plan-reviser',
        instructions: getLocalPrompt('generation-plan-revision'),
    },
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
        generationPlanReviser: create(
            'generation-plan-reviser',
            options.planningModel,
        ),
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

export class TutorStructuredOutputError extends Error {
    constructor(
        readonly reason: 'invalid-output' | 'output-limit',
        readonly diagnostic: GenerationFailureDiagnostic = {
            code: reason === 'output-limit' ? 'output-limit' : 'schema-invalid',
        },
    ) {
        super(
            reason === 'output-limit'
                ? 'The structured response reached its output limit.'
                : 'The structured response was invalid.',
        );

        this.name = 'TutorStructuredOutputError';
    }
}

function terminalStructuredFailure(reason: StructuredFinishReason) {
    if (reason === 'content-filter' || reason === 'error') {
        return new GenerationExecutionFailure({
            code: 'provider-rejected',
            phase: 'decode',
            finishReason: reason,
        });
    }

    if (reason === 'other' || reason === 'unknown') {
        return new GenerationExecutionFailure({
            code: 'content-invalid',
            phase: 'decode',
            finishReason: reason,
        });
    }

    if (reason === 'length') {
        return new TutorStructuredOutputError('output-limit', {
            code: 'output-limit',
            phase: 'decode',
            finishReason: reason,
        });
    }
}

/** A configured gate can distinguish "no eligible settled call" from a standalone
 * synthetic agent that doesn't use the worker's financial receipts at all. */
export function structuredResponseReader(
    gate:
        | {
              completedStructuredResponse?(
                  id: string,
              ): StructuredFinishReason | undefined;
          }
        | undefined,
    validationId: string,
) {
    return gate?.completedStructuredResponse
        ? () => gate.completedStructuredResponse!(validationId)
        : undefined;
}

export async function generateTutorObject(input: {
    agent: Agent;
    prompt: string;
    schema: z.ZodType;
    signal: AbortSignal;
    operationId: string;
    maxOutputTokens: number;
    completedResponse?: (() => StructuredFinishReason | undefined) | undefined;
}) {
    try {
        const result = await input.agent.generate(input.prompt, {
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

        input.signal.throwIfAborted();
        if (result.tripwire) {
            throw new GenerationExecutionFailure({
                code: 'content-invalid',
                phase: 'decode',
            });
        }

        // The low-level measured attempt is authoritative when Mastra aggregates
        // steps into a different high-level finish reason.
        const receipt = input.completedResponse?.();
        const reason =
            receipt ??
            (result.finishReason == null
                ? undefined
                : structuredFinishReason(result.finishReason));

        if (reason === 'content-filter' || reason === 'error') {
            throw terminalStructuredFailure(reason);
        }

        if (result.error) {
            throw result.error;
        }

        if (input.completedResponse && !receipt) {
            // A decoder result alone cannot make an unmeasured/multi-call attempt
            // eligible for repair or publication. Preserve any original SDK error above.
            throw new GenerationExecutionFailure({
                code: 'publication',
                phase: 'receipt',
            });
        }

        if (reason === 'length') {
            throw terminalStructuredFailure(reason);
        }

        const object = await result.object;
        if (reason === 'unknown' || reason === 'other') {
            // A complete schema-valid object is usable even when its provider
            // omitted the finish category. Never repair on this evidence alone.
            const parsed = input.schema.safeParse(object);
            if (!parsed.success) {
                throw new GenerationExecutionFailure({
                    code: 'content-invalid',
                    phase: 'decode',
                    finishReason: reason,
                });
            }
        }

        return object;
    } catch (error) {
        input.signal.throwIfAborted();
        if (
            error instanceof GenerationExecutionFailure ||
            error instanceof TutorStructuredOutputError
        ) {
            throw error;
        }

        const receipt = input.completedResponse?.();
        if (receipt) {
            const terminal = terminalStructuredFailure(receipt);
            if (terminal) {
                throw terminal;
            }
        }

        const diagnostic = completedStructuredFailure(error);
        if (diagnostic?.code === 'provider-rejected') {
            throw new GenerationExecutionFailure({
                ...diagnostic,
                phase: 'decode',
            });
        }

        if (diagnostic && input.completedResponse && !receipt) {
            throw new GenerationExecutionFailure({
                code: 'publication',
                phase: 'receipt',
            });
        }

        if (diagnostic?.finishReason && !receipt) {
            const terminal = terminalStructuredFailure(diagnostic.finishReason);
            if (terminal) {
                throw terminal;
            }
        }

        if (diagnostic || receipt === 'stop' || receipt === 'tool-calls') {
            const evidence = {
                ...diagnostic,
                code: diagnostic?.code ?? 'schema-invalid',
                phase: 'decode' as const,
                ...(receipt ? { finishReason: receipt } : {}),
            };

            throw new TutorStructuredOutputError(
                evidence.code === 'output-limit'
                    ? 'output-limit'
                    : 'invalid-output',
                evidence,
            );
        }

        throw error;
    }
}
