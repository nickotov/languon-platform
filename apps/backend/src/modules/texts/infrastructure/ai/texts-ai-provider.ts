import { z } from 'zod';
import { SUPPORTED_LANGUAGE_TAGS } from '@languon/languages';
import {
    TextDetectionResultSchema,
    TextTranslationSegmentSchema,
} from '@languon/contracts';
import { getLocalPrompt } from '@languon/prompts';
import type {
    TextsAiProvider,
    TextsProviderCall,
    TextsTokenUsage,
    TextJobInput,
} from '../../application/ports/texts-ai-provider';
import {
    TextsAiError,
    TextsProviderInvalidOutputError,
} from '../../application/ports/texts-ai-provider';
import type {
    TextAiExecutionSnapshot,
    TextAiProviderBudgetPolicy,
} from '../../../text-ai/application/text-ai-provider-catalog';
import { resolveTextAiProviderOptions } from '../../../text-ai/infrastructure/ai/text-ai-provider-resolver';
import { textAiRequestLimits } from '../../../text-ai/infrastructure/ai/text-ai-provider-catalog';
import { createTextsAgents } from './texts-agents';
const translationSchema = z
    .object({
        translation: z.array(TextTranslationSegmentSchema).min(1).max(20_000),
    })
    .strict();
function request(input: TextJobInput) {
    return input.kind === 'text-translation'
        ? {
              sourceText: input.sourceText,
              sourceLanguage: input.sourceLanguage,
              targetLanguage: input.targetLanguage,
              segments: input.segments,
          }
        : {
              sourceText: input.sourceText,
              supportedLanguages: SUPPORTED_LANGUAGE_TAGS,
          };
}
/** Conservative byte upper bounds: fail before reservation/provider, never silently truncate. */
export function preflightTextsRequest(
    input: TextJobInput,
    execution: TextAiExecutionSnapshot,
    budget: TextAiProviderBudgetPolicy,
) {
    const schema =
        input.kind === 'text-translation'
            ? translationSchema
            : TextDetectionResultSchema;
    const prompt = getLocalPrompt(
        input.kind === 'text-translation'
            ? 'text-translation-agent'
            : 'text-detection-agent',
    );
    const inputBound =
        Buffer.byteLength(JSON.stringify(request(input)), 'utf8') +
        Buffer.byteLength(prompt, 'utf8') +
        Buffer.byteLength(JSON.stringify(z.toJSONSchema(schema)), 'utf8') +
        1024;
    const outputBound =
        input.kind === 'text-translation'
            ? Buffer.byteLength(input.sourceText, 'utf8') * 2 +
              input.segments.length * 100 +
              256
            : 256;
    if (
        inputBound >
            Math.min(
                execution.perCallMaxInputTokens,
                budget.maxInputTokensPerAttempt,
            ) ||
        outputBound >
            Math.min(
                execution.perCallMaxOutputTokens,
                budget.maxOutputTokensPerAttempt,
            )
    )
        throw new TextsAiError(
            'model_request_too_large',
            'This model cannot safely translate the complete text. Choose a model with larger limits or shorten the text.',
        );
}
function usageOf(
    value: unknown,
    limits: { maxInputTokens: number; maxOutputTokens: number },
): TextsTokenUsage | undefined {
    if (value === undefined || value === null) return undefined;
    const v = z
        .object({
            inputTokens: z
                .number()
                .int()
                .nonnegative()
                .max(limits.maxInputTokens),
            outputTokens: z
                .number()
                .int()
                .nonnegative()
                .max(limits.maxOutputTokens),
        })
        .safeParse(value);
    if (!v.success) throw new TextsProviderInvalidOutputError();
    return v.data;
}
export function createTextsAiProvider(options: {
    credentials: Partial<Record<'DEEPSEEK_API_KEY' | 'KIE_API_KEY', string>>;
    fetchProvider?: typeof fetch;
}): TextsAiProvider {
    return {
        async run(call) {
            call.signal.throwIfAborted();
            preflightTextsRequest(call.input, call.execution, call.budget);
            const resolved = resolveTextAiProviderOptions({
                snapshot: call.execution,
                budget: call.budget,
                ...options,
            });
            const limits = textAiRequestLimits({
                aggregate: call.budget,
                model: resolved.modelRequestLimits,
            });
            const agents = createTextsAgents({ model: resolved.model });
            const agent =
                call.input.kind === 'text-translation'
                    ? agents.textTranslationAgent
                    : agents.textDetectionAgent;
            const schema =
                call.input.kind === 'text-translation'
                    ? translationSchema
                    : TextDetectionResultSchema;
            let result;
            try {
                result = await agent.generate(
                    JSON.stringify(request(call.input)),
                    {
                        abortSignal: call.signal,
                        maxSteps: 1,
                        modelSettings: {
                            maxOutputTokens: limits.maxOutputTokens,
                            maxRetries: 0,
                        },
                        structuredOutput: {
                            schema,
                            ...(resolved.structuredOutputMode ===
                            'prompt-injection'
                                ? { jsonPromptInjection: 'inline' as const }
                                : {}),
                        },
                        runId: call.idempotencyKey,
                        toolChoice: 'none',
                        tracingOptions: { hideInput: true, hideOutput: true },
                    },
                );
            } catch (error) {
                if (
                    error &&
                    typeof error === 'object' &&
                    'name' in error &&
                    error.name === 'AI_NoObjectGeneratedError'
                )
                    throw new TextsProviderInvalidOutputError(
                        'usage' in error
                            ? usageOf(error.usage, limits)
                            : undefined,
                    );
                throw error;
            }
            call.signal.throwIfAborted();
            const usage = usageOf(result.usage, limits);
            if (result.error || result.tripwire)
                throw new TextsProviderInvalidOutputError(usage);
            const parsed = schema.safeParse(result.object);
            if (!parsed.success)
                throw new TextsProviderInvalidOutputError(usage);
            return { draft: parsed.data, ...(usage ? { usage } : {}) };
        },
    };
}
/** Injected synthetic fixtures only; worker applies the same production validation. */
export class DeterministicTextsAiProvider implements TextsAiProvider {
    constructor(
        private readonly fixture: (
            input: TextJobInput,
        ) =>
            | ReturnType<TextsAiProvider['run']>
            | Awaited<ReturnType<TextsAiProvider['run']>>,
    ) {}
    async run(call: TextsProviderCall) {
        call.signal.throwIfAborted();
        return this.fixture(call.input);
    }
}
