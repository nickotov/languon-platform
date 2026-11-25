import { textCallInputTokenBound } from '../../../text-ai/application/text-call-input-bound';
import { learningContentActionOutputLimit } from '../../application/learning-content-batches';
import {
    structuredFinishReason,
    type StructuredFinishReason,
} from './structured-output-diagnostics';
import { readProviderTokenUsage } from '../../../text-ai/infrastructure/ai/provider-token-usage';
import {
    withTextAiProviderAttemptWitness,
    type TextAiProviderAttemptWitness,
} from '../../../text-ai/infrastructure/ai/text-ai-provider-attempt-context.js';
import { randomUUID } from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';
import { ConversationError } from '../../domain/conversation.js';
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

export const tutorStageTimeLimitMs = 120_000;

export class TutorOperationLimitError extends Error {
    constructor() {
        super(
            'The conversation operation exceeded its available context or execution budget.',
        );

        this.name = 'TutorOperationLimitError';
    }
}

function readUsage(usage: unknown): TutorCallUsage | null {
    try {
        return readProviderTokenUsage(usage, {
            maxInputTokens: Number.MAX_SAFE_INTEGER,
            maxOutputTokens: Number.MAX_SAFE_INTEGER,
        });
    } catch {
        return null;
    }
}

/** Some adapters attach their final measured partial usage to an abort/error object. */
function readFailureUsage(error: unknown): TutorCallUsage | undefined {
    if (typeof error !== 'object' || error === null || !('usage' in error)) {
        return undefined;
    }

    return readUsage(error.usage) ?? undefined;
}

/** One shared gate for the actor, observer and reflector of a single admitted operation. */
export function createTutorModelGate(options: {
    accounting: TutorAccountingPort;
    attemptWitness?: Omit<TextAiProviderAttemptWitness, 'attemptId'>;
    signal: AbortSignal;
    maxInputTokens: number;
    maxCalls?: number;
    maxMemoryCalls?: number;
    deadline?: number;
}) {
    const controller = new AbortController();
    const deadline = options.deadline ?? Date.now() + tutorStageTimeLimitMs;
    const signal = AbortSignal.any([
        options.signal,
        controller.signal,
        AbortSignal.timeout(Math.max(1, deadline - Date.now())),
    ]);
    let calls = 0;
    let memoryCalls = 0;
    // Reservations include concurrent calls and unknown failed usage.
    let allocatedOutputTokens = 0;
    let contextExceeded = false;
    let providerFailure: { error: unknown; purpose: TutorCallPurpose } | null =
        null;
    const maxCalls = options.maxCalls ?? 5;
    const maxMemoryCalls = options.maxMemoryCalls ?? 2;
    const validationContext = new AsyncLocalStorage<string>();
    const settledResponses = new WeakMap<
        TutorCallAdmission,
        StructuredFinishReason
    >();
    const structuredCalls = new Map<string, TutorCallAdmission[]>();

    const wrap = <Model extends TutorExecutableModel>(
        model: Model,
        purpose: TutorCallPurpose,
    ): Model => {
        const prepare = async (input: CallOptions) => {
            signal.throwIfAborted();
            const inputTokenEstimate = textCallInputTokenBound(input);

            if (inputTokenEstimate > options.maxInputTokens) {
                contextExceeded = true;

                throw new ConversationError(
                    'context_too_large',
                    'The complete editor, references and conversation exceed the model input limit after compaction. Reduce the editor text or references and try again.',
                );
            }

            if (
                Date.now() >= deadline ||
                calls >= maxCalls ||
                !Number.isSafeInteger(inputTokenEstimate) ||
                inputTokenEstimate < 0 ||
                allocatedOutputTokens >= learningContentActionOutputLimit ||
                ((purpose === 'observation' || purpose === 'reflection') &&
                    (memoryCalls >= maxMemoryCalls || calls >= maxCalls - 1))
            ) {
                controller.abort(new TutorOperationLimitError());
                signal.throwIfAborted();
            }

            const memoryPurpose =
                purpose === 'observation' || purpose === 'reflection';
            const outputCap = memoryPurpose
                ? 2048
                : purpose === 'planning'
                  ? 2048
                  : 4096;
            const maxOutputTokens = Math.min(
                input.maxOutputTokens ?? outputCap,
                outputCap,
                learningContentActionOutputLimit - allocatedOutputTokens,
            );

            if (
                !Number.isSafeInteger(maxOutputTokens) ||
                maxOutputTokens <= 0
            ) {
                throw new TutorOperationLimitError();
            }

            allocatedOutputTokens += maxOutputTokens;
            const validationId = validationContext.getStore();
            const call: TutorCallAdmission = {
                callId: randomUUID(),
                ...(validationId ? { validationId } : {}),
                purpose,
                inputTokenEstimate,
                maxOutputTokens,
            };

            calls += 1;
            if (memoryPurpose) {
                memoryCalls += 1;
            }

            try {
                const admitted = await options.accounting.admit(call);
                if (call.validationId) {
                    structuredCalls.get(call.validationId)!.push(call);
                }

                if (admitted) {
                    if (
                        !Number.isSafeInteger(admitted.maxOutputTokens) ||
                        admitted.maxOutputTokens < 1 ||
                        admitted.maxOutputTokens > call.maxOutputTokens
                    ) {
                        throw new TutorOperationLimitError();
                    }

                    allocatedOutputTokens -=
                        call.maxOutputTokens - admitted.maxOutputTokens;

                    call.maxOutputTokens = admitted.maxOutputTokens;
                }
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
                    maxOutputTokens: call.maxOutputTokens,
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
            usage?: TutorCallUsage,
        ) => {
            controller.abort(
                new DOMException(
                    'Conversation generation stopped.',
                    'AbortError',
                ),
            );

            if (usage) {
                await options.accounting.fail(call, reason, usage);
            } else {
                await options.accounting.fail(call, reason);
            }
        };

        return new Proxy(model, {
            get(target, property) {
                if (property === 'doGenerate') {
                    return async (input: CallOptions) => {
                        const prepared = await prepare(input);
                        let settled = false;
                        try {
                            const result = await invokeAdmitted(
                                prepared.call,
                                () => target.doGenerate(prepared.input),
                            );

                            if ('stream' in result) {
                                return trackStream(
                                    result,
                                    prepared.call,
                                    prepared.input.abortSignal,
                                );
                            }

                            const finishReason = structuredFinishReason(
                                result.finishReason,
                            );

                            prepared.call.providerCompleted =
                                finishReason === 'stop' ||
                                finishReason === 'length';

                            if (finishReason === 'length') {
                                prepared.call.outputLimitReached = true;
                            }

                            const usage = readUsage(result.usage);
                            if (!usage) {
                                settled = true;
                                await options.accounting.fail(
                                    prepared.call,
                                    'missing-usage',
                                );

                                return result;
                            }

                            if (finishReason === 'length') {
                                usage.outputLimitReached = true;
                            }

                            await settleUsage(
                                prepared.call,
                                usage,
                                result.finishReason,
                            );

                            settled = true;

                            return result;
                        } catch (error) {
                            providerFailure = { error, purpose };
                            if (!settled) {
                                await fail(
                                    prepared.call,
                                    signal.aborted
                                        ? 'aborted'
                                        : 'provider-error',
                                    readFailureUsage(error),
                                );
                            }

                            throw error;
                        }
                    };
                }

                if (property === 'doStream') {
                    return async (input: CallOptions) => {
                        const prepared = await prepare(input);
                        try {
                            return trackStream(
                                await invokeAdmitted(prepared.call, () =>
                                    target.doStream(prepared.input),
                                ),
                                prepared.call,
                                prepared.input.abortSignal,
                            );
                        } catch (error) {
                            providerFailure = { error, purpose };
                            await fail(
                                prepared.call,
                                signal.aborted ? 'aborted' : 'provider-error',
                                readFailureUsage(error),
                            );

                            throw error;
                        }
                    };
                }

                const value: unknown = Reflect.get(target, property, target);

                return typeof value === 'function' ? value.bind(target) : value;
            },
        });

        function invokeAdmitted<T>(
            call: TutorCallAdmission,
            invoke: () => T,
        ): T {
            return options.attemptWitness
                ? withTextAiProviderAttemptWitness(
                      { ...options.attemptWitness, attemptId: call.callId },
                      invoke,
                  )
                : invoke();
        }

        async function settleUsage(
            call: TutorCallAdmission,
            usage: TutorCallUsage,
            finishReason: unknown,
        ) {
            if (
                usage.outputTokens > call.maxOutputTokens ||
                usage.inputTokens > options.maxInputTokens
            ) {
                throw new TutorOperationLimitError();
            }

            await options.accounting.settle(call, usage);
            // Measurement alone cannot establish a valid answer. Retain the exact
            // terminal classification only after successful settlement for this call.
            settledResponses.set(call, structuredFinishReason(finishReason));

            allocatedOutputTokens -= call.maxOutputTokens - usage.outputTokens;
        }

        function trackStream(
            result: Awaited<ReturnType<TutorProviderModel['doStream']>>,
            call: TutorCallAdmission,
            abortSignal: AbortSignal,
        ) {
            let finalized = false;
            let lastFailureUsage: TutorCallUsage | undefined;
            const failOnce = async (
                reason: 'provider-error' | 'missing-usage' | 'aborted',
                usage?: TutorCallUsage,
            ) => {
                if (finalized) {
                    return;
                }

                finalized = true;
                // This stream was opened by the provider. A naked EOF or local
                // cancellation before finish leaves the dispatched attempt uncertain.
                if (!call.providerCompleted) {
                    providerFailure ??= {
                        purpose,
                        error: new Error(
                            'The provider stream ended before a terminal result.',
                        ),
                    };
                }

                await fail(call, reason, usage);
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
                    const pendingRead = reader
                        .read()
                        .catch((error: unknown) => {
                            providerFailure = { error, purpose };
                            lastFailureUsage = readFailureUsage(error);

                            throw error;
                        });

                    return await Promise.race([pendingRead, cancelled]);
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
                                if (!finalized) {
                                    await failOnce('missing-usage');
                                }

                                if (signal.aborted) {
                                    throw signal.reason;
                                }

                                streamController.close();

                                return;
                            }

                            if (next.value.type === 'error') {
                                providerFailure = {
                                    error: next.value.error,
                                    purpose,
                                };

                                await failOnce(
                                    'provider-error',
                                    readFailureUsage(next.value.error),
                                );

                                throw new Error(
                                    'The language provider could not complete this response.',
                                );
                            }

                            if (next.value.type === 'finish') {
                                const finishReason = structuredFinishReason(
                                    next.value.finishReason,
                                );

                                call.providerCompleted =
                                    finishReason === 'stop' ||
                                    finishReason === 'length';

                                if (finishReason === 'length') {
                                    call.outputLimitReached = true;
                                }

                                const usage = readUsage(next.value.usage);
                                if (!usage) {
                                    finalized = true;
                                    await options.accounting.fail(
                                        call,
                                        'missing-usage',
                                    );
                                } else {
                                    if (finishReason === 'length') {
                                        usage.outputLimitReached = true;
                                    }

                                    await settleUsage(
                                        call,
                                        usage,
                                        next.value.finishReason,
                                    );

                                    finalized = true;
                                }
                            }

                            streamController.enqueue(next.value);
                        } catch (error) {
                            await failOnce(
                                abortSignal.aborted
                                    ? 'aborted'
                                    : 'provider-error',
                                readFailureUsage(error) ?? lastFailureUsage,
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
        completedStructuredResponse(validationId: string) {
            const calls = structuredCalls.get(validationId);
            const call = calls?.length === 1 ? calls[0] : undefined;

            return call ? settledResponses.get(call) : undefined;
        },
        withStructuredValidation<T>(
            validationId: string,
            work: () => PromiseLike<T>,
        ): Promise<T> {
            if (!validationId || structuredCalls.has(validationId)) {
                throw new Error(
                    'Structured validation identity must be unique.',
                );
            }

            structuredCalls.set(validationId, []);

            return Promise.resolve(validationContext.run(validationId, work));
        },
        async acceptStructuredCall(validationId: string) {
            const admitted = structuredCalls.get(validationId);
            if (!admitted?.length) {
                throw new Error('Structured validation has no admitted call.');
            }

            if (admitted.some((call) => call.outputLimitReached)) {
                throw new Error(
                    'Incomplete provider output cannot be accepted.',
                );
            }

            for (const call of admitted) {
                await options.accounting.validateStructuredCall?.(call, {
                    accepted: true,
                });
            }
        },
        async rejectStructuredCall(validationId: string) {
            for (const call of structuredCalls.get(validationId) ?? []) {
                await options.accounting.validateStructuredCall?.(call, {
                    accepted: false,
                });
            }
        },
        signal,
        abort: (reason?: unknown) => controller.abort(reason),
        get providerFailure() {
            return providerFailure;
        },
        get contextExceeded() {
            return contextExceeded;
        },
        get calls() {
            return calls;
        },
        get remainingBudget() {
            // Consumers may plan work from this snapshot; admission still owns the limits.
            return Object.freeze({
                remainingTimeMs: Math.max(0, deadline - Date.now()),
                perCallInputLimit: options.maxInputTokens,
                remainingCalls: Math.max(0, maxCalls - calls),
                remainingOutputTokens: Math.max(
                    0,
                    learningContentActionOutputLimit - allocatedOutputTokens,
                ),
            });
        },
    };
}
