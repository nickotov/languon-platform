import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { LanguageModel, MastraModelConfig } from '@mastra/core/llm';
import type {
    TutorAccountingPort,
    TutorCallAdmission,
    TutorCallPurpose,
    TutorCallUsage,
} from '../../application/ports/tutor-runner.js';

type TutorWrappedModel = Extract<LanguageModel, { specificationVersion: 'v2' }>;
export type TutorProviderModel = Exclude<
    Extract<MastraModelConfig, { specificationVersion: 'v2' }>,
    TutorWrappedModel
>;
type TutorExecutableModel = TutorProviderModel | TutorWrappedModel;
type CallOptions = Parameters<TutorProviderModel['doStream']>[0];

export class TutorOperationLimitError extends Error {
    constructor() {
        super(
            'The conversation operation exceeded its available context or execution budget.',
        );
        this.name = 'TutorOperationLimitError';
    }
}

const tokenCount = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const usageSchema = z.object({
    // The pinned router exposes V7 usage totals while declaring its V2 facade.
    // Direct V2 provider fixtures expose scalar totals. Reject missing totals.
    inputTokens: z.union([tokenCount, z.object({ total: tokenCount })]),
    outputTokens: z.union([tokenCount, z.object({ total: tokenCount })]),
});
function readUsage(usage: unknown): TutorCallUsage | null {
    const parsed = usageSchema.safeParse(usage);
    if (!parsed.success) return null;
    const { inputTokens, outputTokens } = parsed.data;
    return {
        inputTokens:
            typeof inputTokens === 'number' ? inputTokens : inputTokens.total,
        outputTokens:
            typeof outputTokens === 'number'
                ? outputTokens
                : outputTokens.total,
    };
}

/** One shared gate for the actor, observer and reflector of a single admitted operation. */
export function createTutorModelGate(options: {
    accounting: TutorAccountingPort;
    signal: AbortSignal;
    maxInputTokens: number;
    maxCalls?: number;
    maxMemoryCalls?: number;
    deadline?: number;
    estimateInputTokens?: (options: CallOptions) => number;
}) {
    const controller = new AbortController();
    const deadline = options.deadline ?? Date.now() + 120_000;
    const signal = AbortSignal.any([
        options.signal,
        controller.signal,
        AbortSignal.timeout(Math.max(1, deadline - Date.now())),
    ]);
    let calls = 0;
    let memoryCalls = 0;
    const maxCalls = options.maxCalls ?? 5;
    const maxMemoryCalls = options.maxMemoryCalls ?? 2;

    const wrap = <Model extends TutorExecutableModel>(
        model: Model,
        purpose: TutorCallPurpose,
    ): Model => {
        const prepare = async (input: CallOptions) => {
            signal.throwIfAborted();
            const inputTokenEstimate =
                options.estimateInputTokens?.(input) ??
                Buffer.byteLength(
                    JSON.stringify({
                        prompt: input.prompt,
                        tools: input.tools,
                    }),
                    'utf8',
                );
            if (
                Date.now() >= deadline ||
                calls >= maxCalls ||
                !Number.isSafeInteger(inputTokenEstimate) ||
                inputTokenEstimate < 0 ||
                inputTokenEstimate > options.maxInputTokens ||
                (purpose !== 'answer' &&
                    (memoryCalls >= maxMemoryCalls || calls >= maxCalls - 1))
            ) {
                controller.abort(new TutorOperationLimitError());
                signal.throwIfAborted();
            }
            const outputCap = purpose === 'answer' ? 4096 : 2048;
            const maxOutputTokens = Math.min(
                input.maxOutputTokens ?? outputCap,
                outputCap,
            );
            const call: TutorCallAdmission = {
                callId: randomUUID(),
                purpose,
                inputTokenEstimate,
                maxOutputTokens,
            };
            calls += 1;
            if (purpose !== 'answer') memoryCalls += 1;
            try {
                await options.accounting.admit(call);
            } catch (error) {
                controller.abort(error);
                throw error;
            }
            if (signal.aborted) {
                await options.accounting.fail(call, 'aborted');
                signal.throwIfAborted();
            }
            return {
                call,
                input: {
                    ...input,
                    maxOutputTokens,
                    // DeepSeek native tools run with thinking disabled. Its compatible
                    // SDK forwards unknown provider fields into the actual JSON body.
                    ...(model.provider.startsWith('deepseek')
                        ? {
                              providerOptions: {
                                  ...input.providerOptions,
                                  deepseek: {
                                      ...input.providerOptions?.deepseek,
                                      thinking: { type: 'disabled' },
                                  },
                              },
                          }
                        : {}),
                    abortSignal: AbortSignal.any([
                        signal,
                        ...(input.abortSignal ? [input.abortSignal] : []),
                    ]),
                },
            };
        };

        const fail = async (
            call: TutorCallAdmission,
            reason: 'provider-error' | 'missing-usage' | 'aborted',
        ) => {
            controller.abort(
                new DOMException(
                    'Conversation generation stopped.',
                    'AbortError',
                ),
            );
            await options.accounting.fail(call, reason);
        };

        return new Proxy(model, {
            get(target, property) {
                if (property === 'doGenerate')
                    return async (input: CallOptions) => {
                        const prepared = await prepare(input);
                        let settled = false;
                        try {
                            const result = await target.doGenerate(
                                prepared.input,
                            );
                            if ('stream' in result)
                                return trackStream(
                                    result,
                                    prepared.call,
                                    prepared.input.abortSignal,
                                );
                            const usage = readUsage(result.usage);
                            if (!usage) {
                                settled = true;
                                await fail(prepared.call, 'missing-usage');
                                throw new Error(
                                    'Provider usage was unavailable.',
                                );
                            }
                            await options.accounting.settle(
                                prepared.call,
                                usage,
                            );
                            settled = true;
                            return result;
                        } catch (error) {
                            if (!settled)
                                await fail(
                                    prepared.call,
                                    signal.aborted
                                        ? 'aborted'
                                        : 'provider-error',
                                );
                            throw error;
                        }
                    };
                if (property === 'doStream')
                    return async (input: CallOptions) => {
                        const prepared = await prepare(input);
                        try {
                            return trackStream(
                                await target.doStream(prepared.input),
                                prepared.call,
                                prepared.input.abortSignal,
                            );
                        } catch (error) {
                            await fail(
                                prepared.call,
                                signal.aborted ? 'aborted' : 'provider-error',
                            );
                            throw error;
                        }
                    };
                const value: unknown = Reflect.get(target, property, target);
                return typeof value === 'function' ? value.bind(target) : value;
            },
        });

        function trackStream(
            result: Awaited<ReturnType<TutorProviderModel['doStream']>>,
            call: TutorCallAdmission,
            abortSignal: AbortSignal,
        ) {
            let finalized = false;
            const failOnce = async (
                reason: 'provider-error' | 'missing-usage' | 'aborted',
            ) => {
                if (finalized) return;
                finalized = true;
                await fail(call, reason);
            };
            const reader = result.stream.getReader();
            async function readNext() {
                abortSignal.throwIfAborted();
                let onAbort!: () => void;
                const cancelled = new Promise<never>((_resolve, reject) => {
                    onAbort = () => {
                        reject(abortSignal.reason);
                        void reader.cancel().catch(() => undefined);
                    };
                    abortSignal.addEventListener('abort', onAbort, {
                        once: true,
                    });
                });
                try {
                    return await Promise.race([reader.read(), cancelled]);
                } finally {
                    abortSignal.removeEventListener('abort', onAbort);
                }
            }
            return {
                ...result,
                stream: new ReadableStream({
                    async pull(streamController) {
                        try {
                            const next = await readNext();
                            if (next.done) {
                                if (!finalized) await failOnce('missing-usage');
                                if (signal.aborted) throw signal.reason;
                                streamController.close();
                                return;
                            }
                            if (next.value.type === 'error') {
                                await failOnce('provider-error');
                                throw new Error(
                                    'The language provider could not complete this response.',
                                );
                            }
                            if (next.value.type === 'finish') {
                                const usage = readUsage(next.value.usage);
                                if (!usage) {
                                    await failOnce('missing-usage');
                                    throw new Error(
                                        'Provider usage was unavailable.',
                                    );
                                }
                                await options.accounting.settle(call, usage);
                                finalized = true;
                            }
                            streamController.enqueue(next.value);
                        } catch (error) {
                            await failOnce(
                                abortSignal.aborted
                                    ? 'aborted'
                                    : 'provider-error',
                            );
                            void reader.cancel().catch(() => undefined);
                            streamController.error(error);
                        }
                    },
                    async cancel() {
                        await failOnce('aborted');
                        void reader.cancel().catch(() => undefined);
                    },
                }),
            };
        }
    };
    return {
        wrap,
        signal,
        abort: (reason?: unknown) => controller.abort(reason),
        get calls() {
            return calls;
        },
    };
}
