import { z } from 'zod';
import {
    KnowledgeExerciseEvaluationResultSchema,
    type KnowledgeExerciseEvaluationResult,
} from '@languon/contracts';
import { getLocalPrompt } from '@languon/prompts';
import { createKnowledgeActionAgents } from './knowledge-action-agents';
import {
    TextsAiError,
    TextsProviderInvalidOutputError,
    type TextsProviderCall,
} from '../../../texts/application/ports/texts-ai-provider';
import type {
    TextAiExecutionSnapshot,
    TextAiProviderBudgetPolicy,
} from '../../../text-ai/application/text-ai-provider-catalog';
import { resolveTextAiProviderOptions } from '../../../text-ai/infrastructure/ai/text-ai-provider-resolver';
import { textAiRequestLimits } from '../../../text-ai/infrastructure/ai/text-ai-provider-catalog';
import { withQueuedTextAiProviderAttempt } from '../../../text-ai/infrastructure/ai/with-queued-text-ai-provider-attempt';
import { readProviderTokenUsage } from '../../../text-ai/infrastructure/ai/provider-token-usage';
import { ProviderExecutionError } from '../../../text-ai/infrastructure/ai/provider-execution-outcome';
import type { KnowledgeExerciseEvaluationInput } from '../../application/ports/exercise-evaluation-store';

const providerInput = (input: KnowledgeExerciseEvaluationInput) => ({
    exercise: input.exercise,
    learnerAnswer: input.answer,
    sourcePassages: input.sourcePassages,
    replyLanguage: input.replyLanguage,
});

export function preflightKnowledgeExerciseEvaluation(
    input: KnowledgeExerciseEvaluationInput,
    execution: TextAiExecutionSnapshot,
    budget: TextAiProviderBudgetPolicy,
) {
    const inputBytes =
        Buffer.byteLength(JSON.stringify(providerInput(input)), 'utf8') +
        Buffer.byteLength(
            getLocalPrompt('knowledge-exercise-evaluation-agent'),
            'utf8',
        ) +
        Buffer.byteLength(
            JSON.stringify(
                z.toJSONSchema(KnowledgeExerciseEvaluationResultSchema),
            ),
            'utf8',
        ) +
        1024;
    if (
        inputBytes >
        Math.min(
            execution.perCallMaxInputTokens,
            budget.maxInputTokensPerAttempt,
        )
    )
        throw new TextsAiError('model_capacity_exceeded');
}

export function validateKnowledgeExerciseEvaluationResult(
    input: KnowledgeExerciseEvaluationInput,
    value: unknown,
): KnowledgeExerciseEvaluationResult {
    // The canonical result schema rejects claims that an incorrect answer is a valid alternative.
    void input;
    return KnowledgeExerciseEvaluationResultSchema.parse(value);
}

type ProviderOptions = Parameters<typeof resolveTextAiProviderOptions>[0];
export async function runKnowledgeExerciseEvaluation(
    options: Omit<ProviderOptions, 'snapshot' | 'budget'>,
    call: TextsProviderCall,
    input: KnowledgeExerciseEvaluationInput,
) {
    preflightKnowledgeExerciseEvaluation(input, call.execution, call.budget);
    const resolved = resolveTextAiProviderOptions({
        ...options,
        snapshot: call.execution,
        budget: call.budget,
    });
    const limits = textAiRequestLimits({
        aggregate: call.budget,
        model: resolved.modelRequestLimits,
    });
    const agent = createKnowledgeActionAgents({
        model: resolved.model,
    }).knowledgeExerciseEvaluationAgent;
    let result;
    try {
        result = await withQueuedTextAiProviderAttempt(
            call.providerAttempt,
            Boolean(call.execution.routingAuthority),
            () =>
                agent.generate(JSON.stringify(providerInput(input)), {
                    abortSignal: call.signal,
                    maxSteps: 1,
                    toolChoice: 'none',
                    modelSettings: {
                        maxOutputTokens: limits.maxOutputTokens,
                        maxRetries: 0,
                    },
                    ...(call.execution.providerId === 'deepseek' &&
                    call.execution.modelId === 'deepseek-flash'
                        ? {
                              providerOptions: {
                                  openaiCompatible: { reasoningEffort: 'none' },
                              },
                          }
                        : {}),
                    structuredOutput: {
                        schema: KnowledgeExerciseEvaluationResultSchema,
                        ...(resolved.structuredOutputMode === 'prompt-injection'
                            ? { jsonPromptInjection: 'inline' as const }
                            : {}),
                    },
                    runId: call.idempotencyKey,
                    tracingOptions: { hideInput: true, hideOutput: true },
                }),
        );
    } catch (error) {
        if (
            error &&
            typeof error === 'object' &&
            'name' in error &&
            error.name === 'AI_NoObjectGeneratedError'
        ) {
            let usage;
            if ('usage' in error && error.usage) {
                try {
                    usage = readProviderTokenUsage(error.usage, limits);
                } catch {
                    /* Invalid reported usage remains unknown, never a fabricated zero. */
                }
            }
            throw new TextsProviderInvalidOutputError(usage);
        }
        throw new ProviderExecutionError(error, call.execution.providerId);
    }
    call.signal.throwIfAborted();
    let usage;
    try {
        usage =
            result.usage == null
                ? undefined
                : readProviderTokenUsage(result.usage, limits, result);
    } catch {
        throw new TextsProviderInvalidOutputError();
    }
    if (result.error)
        throw new ProviderExecutionError(
            result.error,
            call.execution.providerId,
        );
    if (result.tripwire || result.finishReason === 'length')
        throw new TextsProviderInvalidOutputError(usage);
    try {
        return {
            draft: validateKnowledgeExerciseEvaluationResult(
                input,
                result.object,
            ),
            ...(usage ? { usage } : {}),
        };
    } catch {
        throw new TextsProviderInvalidOutputError(usage);
    }
}
