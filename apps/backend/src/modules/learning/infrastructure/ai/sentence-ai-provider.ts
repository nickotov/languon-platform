import { withQueuedTextAiProviderAttempt } from '../../../text-ai/infrastructure/ai/with-queued-text-ai-provider-attempt';
import type { TextAiProviderRuntimeOptions } from '../../../text-ai/infrastructure/ai/text-ai-provider-runtime-observer';
import {
    ProviderExecutionError,
    withProviderExecutionOutcome,
} from '../../../text-ai/infrastructure/ai/provider-execution-outcome';
import { findTextAiModel } from '../../../text-ai/application/text-ai-provider-catalog';
import {
    sentenceProviderFailure,
    type SentenceProviderFailure,
} from './sentence-provider-failure';
import { readProviderTokenUsage } from '../../../text-ai/infrastructure/ai/provider-token-usage';
import { SENTENCE_LIMITS } from '@languon/contracts';
import type { z } from 'zod';
import { SentenceProviderInvalidModelOutputError } from '../../application/ports/sentence-ai-provider';
import type {
    SentenceAiProvider,
    SentenceProviderCall,
    SentenceTokenUsage,
} from '../../application/ports/sentence-ai-provider';
import type {
    SentenceGenerationInput,
    SentenceCheckInput,
    SentenceGenerationDraft,
    SentenceCheckDraft,
} from '../../domain/sentence-types';
import { SentenceGenerationDraftSchema } from '../../domain/sentence-content';
import {
    SentenceCheckDraftSchema,
    resolveSentenceIssueSpan,
} from '../../domain/sentence-feedback';
import {
    SentenceModelUnavailableError,
    SentenceInvalidModelOutputError,
} from '../../domain/sentence-errors';
import { resolveTextAiProviderOptions } from '../../../text-ai/infrastructure/ai/text-ai-provider-resolver';
import { textAiRequestLimits } from '../../../text-ai/infrastructure/ai/text-ai-provider-catalog';
import { createSentenceAgents } from './sentence-agents';
import {
    sentenceGenerationProviderSchema,
    sentenceCheckProviderSchema,
    sentenceProviderInputTokens,
} from './sentence-provider-envelope';
export function createSentenceAiProvider(options: {
    runtime?: TextAiProviderRuntimeOptions;
    credentials: Partial<
        Record<
            | 'DEEPSEEK_API_KEY'
            | 'KIE_API_KEY'
            | 'EVOLINK_API_KEY'
            | 'OPENROUTER_API_KEY',
            string
        >
    >;
    fetchProvider?: typeof fetch;
    onProviderFailure?: (
        event: SentenceProviderFailure & {
            providerId: 'deepseek' | 'kie' | 'evolink' | 'openrouter';
            modelId: string;
            kind: 'generate' | 'check';
        },
    ) => void;
}): SentenceAiProvider {
    async function run<T extends object>(
        call: SentenceProviderCall<
            SentenceGenerationInput | SentenceCheckInput
        >,
        kind: 'generate' | 'check',
        schema: z.ZodType<T>,
        providerInput: object,
    ): Promise<{
        draft: T;
        usage?: { inputTokens: number; outputTokens: number };
    }> {
        call.signal.throwIfAborted();
        if (
            findTextAiModel(call.execution.providerId, call.execution.modelId)
                ?.retired
        )
            throw new SentenceModelUnavailableError(
                'Selected model is unavailable.',
            );
        const resolved = resolveTextAiProviderOptions({
            ...options.runtime,
            snapshot: call.execution,
            budget: call.budget,
            credentials: options.credentials,
            ...(options.fetchProvider
                ? { fetchProvider: options.fetchProvider }
                : {}),
        });
        const limits = textAiRequestLimits({
            aggregate: call.budget,
            model: resolved.modelRequestLimits,
        });
        const message = JSON.stringify(providerInput);
        if (
            sentenceProviderInputTokens(kind, schema, providerInput) >
            limits.maxInputTokens
        )
            throw new SentenceInvalidModelOutputError(
                'Input exceeds pinned token bound',
                'input_token_bound',
            );
        const agents = createSentenceAgents({ model: resolved.model });
        const agent =
            kind === 'generate'
                ? agents.sentenceGenerationAgent
                : agents.sentenceCheckAgent;
        const result = await (async () => {
            try {
                return await withQueuedTextAiProviderAttempt(
                    call.providerAttempt,
                    Boolean(call.execution.routingAuthority),
                    () =>
                        agent.generate(message, {
                            abortSignal: call.signal,
                            modelSettings: {
                                maxOutputTokens: limits.maxOutputTokens,
                                maxRetries: 0,
                            },
                            runId: call.idempotencyKey,
                            structuredOutput: {
                                schema,
                                ...(resolved.structuredOutputMode ===
                                'prompt-injection'
                                    ? { jsonPromptInjection: 'inline' as const }
                                    : {}),
                            },
                            toolChoice: 'none',
                            tracingOptions: {
                                hideInput: true,
                                hideOutput: true,
                            },
                        }),
                );
            } catch (error) {
                // The SDK's native schema failure carries usage as well as raw text.
                // Read only its stable discriminator and bounded usage, never its payload.
                if (
                    error &&
                    typeof error === 'object' &&
                    'name' in error &&
                    error.name === 'AI_NoObjectGeneratedError'
                ) {
                    const usage = validateUsage(
                        'usage' in error ? error.usage : undefined,
                        limits,
                    );
                    throw new SentenceProviderInvalidModelOutputError(
                        'schema_invalid',
                        usage,
                    );
                }
                const failure = sentenceProviderFailure(
                    error,
                    call.execution.providerId,
                );
                try {
                    void Promise.resolve(
                        options.onProviderFailure?.({
                            ...failure,
                            providerId: call.execution.providerId,
                            modelId: call.execution.modelId,
                            kind,
                        }),
                    ).catch(() => undefined);
                } catch {
                    // Diagnostic observers cannot interrupt fenced failure settlement.
                }
                if (
                    failure.reason === 'model_retired' ||
                    failure.reason === 'model_unavailable'
                )
                    throw withProviderExecutionOutcome(
                        new SentenceModelUnavailableError(
                            'Selected model is unavailable.',
                        ),
                        error,
                        call.execution.providerId,
                    );
                if (
                    failure.httpStatus === undefined &&
                    failure.providerCode === undefined
                )
                    throw error;
                throw new ProviderExecutionError(
                    error,
                    call.execution.providerId,
                );
            }
        })();
        call.signal.throwIfAborted();
        const usage = validateUsage(result.usage, limits, result);
        // A strict SDK schema tripwire is invalid model output, not a transport retry.
        if (result.tripwire?.processorId === 'structured-output')
            throw new SentenceProviderInvalidModelOutputError(
                'schema_invalid',
                usage,
            );
        if (result.error || result.tripwire)
            throw new Error('Sentence provider unavailable');
        const parsed = schema.safeParse(result.object);
        if (!parsed.success)
            throw new SentenceProviderInvalidModelOutputError(
                kind === 'check' &&
                    parsed.error.issues.some(
                        (issue) => issue.path[0] === 'targets',
                    )
                    ? 'target_assessments_invalid'
                    : 'schema_invalid',
                usage,
            );
        return { draft: parsed.data, ...(usage ? { usage } : {}) };
    }
    return {
        async generate(call) {
            const ids = call.input.candidates.map((entry) => entry.entryId);
            const aliases = ids.map((_, index) => `candidate-${index + 1}`);
            if (
                ids.length === 0 ||
                ids.length > SENTENCE_LIMITS.candidateEntries ||
                new Set(ids).size !== ids.length ||
                !ids.includes(call.input.priorityEntryId)
            )
                throw new SentenceInvalidModelOutputError(
                    'Invalid generation candidates',
                );
            const schema = sentenceGenerationProviderSchema(
                aliases,
                call.input.generationPolicyVersion,
            );
            const input = {
                generationPolicyVersion: call.input.generationPolicyVersion,
                direction: call.input.direction,
                sourceLanguage: call.input.sourceLanguage,
                targetLanguage: call.input.targetLanguage,
                priorityEntryId:
                    aliases[ids.indexOf(call.input.priorityEntryId)],
                candidates: call.input.candidates.map((entry, index) => ({
                    entryId: aliases[index],
                    sourceText: entry.sourceText,
                    targetText: entry.targetText,
                })),
            };
            const result = await run(call, 'generate', schema, input);
            const mapped = SentenceGenerationDraftSchema.parse({
                ...result.draft,
                segments: result.draft.segments.map((segment) => ({
                    ...segment,
                    entryId:
                        segment.entryId === null
                            ? null
                            : restoreEntryId(segment.entryId, aliases, ids),
                })),
                targets: result.draft.targets.map((target) => ({
                    ...target,
                    entryId: restoreEntryId(target.entryId, aliases, ids),
                })),
            });
            return { ...result, draft: mapped };
        },
        async check(call) {
            const ids = call.input.targets.map((entry) => entry.entryId);
            const aliases = ids.map((_, index) => `target-${index + 1}`);
            if (
                ids.length === 0 ||
                ids.length > SENTENCE_LIMITS.requiredTargets ||
                new Set(ids).size !== ids.length
            )
                throw new SentenceInvalidModelOutputError(
                    'Invalid check targets',
                    'input_invalid',
                );
            const schema = sentenceCheckProviderSchema(aliases);
            const input = {
                sourceText: call.input.sourceText,
                referenceTranslation: call.input.referenceTranslation,
                sourceLanguage: call.input.sourceLanguage,
                targetLanguage: call.input.targetLanguage,
                answer: call.input.answer,
                explanationLanguage: call.input.explanationLanguage,
                hintsRevealed: call.input.revealedHintIds.length > 0,
                targets: call.input.targets.map((entry, index) => ({
                    entryId: aliases[index],
                    sourceText: entry.sourceText,
                    targetText: entry.targetText,
                })),
            };
            const result = await run(call, 'check', schema, input);
            const mapped = SentenceCheckDraftSchema.parse({
                ...result.draft,
                targets: aliases.map((alias, index) => ({
                    ...result.draft.targets[alias]!,
                    entryId: ids[index]!,
                })),
                issues: result.draft.issues.map(({ quote, ...issue }) => ({
                    ...issue,
                    span: resolveSentenceIssueSpan(call.input.answer, quote),
                })),
            });
            return { ...result, draft: mapped };
        },
    };
}
/** Synthetic-only fixture adapter; every draft still passes production worker validation. */
export class DeterministicSentenceAiProvider implements SentenceAiProvider {
    constructor(
        private readonly fixture: {
            generate: (
                input: SentenceGenerationInput,
            ) => SentenceGenerationDraft | Promise<SentenceGenerationDraft>;
            check: (
                input: SentenceCheckInput,
            ) => SentenceCheckDraft | Promise<SentenceCheckDraft>;
        },
    ) {}
    async generate(call: SentenceProviderCall<SentenceGenerationInput>) {
        call.signal.throwIfAborted();
        return { draft: await this.fixture.generate(call.input) };
    }
    async check(call: SentenceProviderCall<SentenceCheckInput>) {
        call.signal.throwIfAborted();
        return { draft: await this.fixture.check(call.input) };
    }
}

function restoreEntryId(
    alias: string,
    aliases: readonly string[],
    ids: readonly string[],
): string {
    const index = aliases.indexOf(alias);
    if (index < 0 || ids[index] === undefined)
        throw new SentenceInvalidModelOutputError(
            'Unknown provider target alias',
        );
    return ids[index]!;
}

function validateUsage(
    reported: unknown,
    limits: { maxInputTokens: number; maxOutputTokens: number },
    transportResult?: unknown,
): SentenceTokenUsage | undefined {
    if (reported === undefined || reported === null) return undefined;
    try {
        return readProviderTokenUsage(reported, limits, transportResult);
    } catch {
        throw new SentenceProviderInvalidModelOutputError('usage_invalid');
    }
}
