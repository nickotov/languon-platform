import { SENTENCE_LIMITS } from '@languon/contracts';
import { Buffer } from 'node:buffer';
import { z } from 'zod';
import { getLocalPrompt } from '@languon/prompts';
import type {
    SentenceAiProvider,
    SentenceProviderCall,
} from '../../application/ports/sentence-ai-provider';
import type {
    SentenceGenerationInput,
    SentenceCheckInput,
    SentenceGenerationDraft,
    SentenceCheckDraft,
} from '../../domain/sentence-types';
import { SentenceGenerationDraftSchema } from '../../domain/sentence-content';
import { SentenceCheckDraftSchema } from '../../domain/sentence-feedback';
import { SentenceInvalidModelOutputError } from '../../domain/sentence-errors';
import { resolveTextAiProviderOptions } from '../../../text-ai/infrastructure/ai/text-ai-provider-resolver';
import { textAiRequestLimits } from '../../../text-ai/infrastructure/ai/text-ai-provider-catalog';
import { createSentenceAgents } from './sentence-agents';
export function createSentenceAiProvider(options: {
    credentials: Partial<Record<'DEEPSEEK_API_KEY' | 'KIE_API_KEY', string>>;
    fetchProvider?: typeof fetch;
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
        const resolved = resolveTextAiProviderOptions({
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
        const prompt =
            kind === 'generate'
                ? 'sentence-generation-agent'
                : 'sentence-check-agent';
        if (
            Buffer.byteLength(message, 'utf8') +
                Buffer.byteLength(getLocalPrompt(prompt), 'utf8') +
                Buffer.byteLength(
                    JSON.stringify(z.toJSONSchema(schema)),
                    'utf8',
                ) +
                16384 >
            limits.maxInputTokens
        )
            throw new SentenceInvalidModelOutputError(
                'Input exceeds pinned token bound',
            );
        const agents = createSentenceAgents({ model: resolved.model });
        const agent =
            kind === 'generate'
                ? agents.sentenceGenerationAgent
                : agents.sentenceCheckAgent;
        const result = await agent.generate(message, {
            abortSignal: call.signal,
            modelSettings: {
                maxOutputTokens: limits.maxOutputTokens,
                maxRetries: 0,
            },
            runId: call.idempotencyKey,
            structuredOutput: {
                schema,
                ...(resolved.structuredOutputMode === 'prompt-injection'
                    ? { jsonPromptInjection: 'inline' as const }
                    : {}),
            },
            toolChoice: 'none',
            tracingOptions: { hideInput: true, hideOutput: true },
        });
        call.signal.throwIfAborted();
        if (result.error || result.tripwire)
            throw new Error('Sentence provider unavailable');
        const parsed = schema.safeParse(result.object);
        if (!parsed.success) throw new SentenceInvalidModelOutputError();
        const usage = result.usage;
        if (!usage) return { draft: parsed.data };
        if (
            !Number.isSafeInteger(usage.inputTokens) ||
            !Number.isSafeInteger(usage.outputTokens) ||
            usage.inputTokens! < 0 ||
            usage.outputTokens! < 0 ||
            usage.inputTokens! > limits.maxInputTokens ||
            usage.outputTokens! > limits.maxOutputTokens
        )
            throw new SentenceInvalidModelOutputError('Invalid usage');
        return {
            draft: parsed.data,
            usage: {
                inputTokens: usage.inputTokens!,
                outputTokens: usage.outputTokens!,
            },
        };
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
            const alias = z.enum(aliases as [string, ...string[]]);
            const schema = SentenceGenerationDraftSchema.extend({
                segments: SentenceGenerationDraftSchema.shape.segments.element
                    .extend({ entryId: alias.nullable() })
                    .array()
                    .min(1)
                    .max(SENTENCE_LIMITS.segments),
                targets: SentenceGenerationDraftSchema.shape.targets.element
                    .extend({ entryId: alias })
                    .array()
                    .min(1)
                    .max(3),
            });
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
                );
            const alias = z.enum(aliases as [string, ...string[]]);
            const schema = SentenceCheckDraftSchema.extend({
                targets: SentenceCheckDraftSchema.shape.targets.element
                    .extend({ entryId: alias })
                    .array()
                    .min(1)
                    .max(3),
            });
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
                targets: result.draft.targets.map((target) => ({
                    ...target,
                    entryId: restoreEntryId(target.entryId, aliases, ids),
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
