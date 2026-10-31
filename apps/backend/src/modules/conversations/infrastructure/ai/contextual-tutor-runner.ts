import type { TextAiProviderAttemptWitness } from '../../../text-ai/infrastructure/ai/text-ai-provider-attempt-context.js';
import { ProviderExecutionError } from '../../../text-ai/infrastructure/ai/provider-execution-outcome';
import {
    tutorContextInstructions,
    tutorReservedInputBytes,
} from '../../application/tutor-context-budget';
import { getLocalPrompt } from '@languon/prompts';
import { Agent } from '@mastra/core/agent';
import { noopLogger } from '@mastra/core/logger';
import {
    resolveModelConfig,
    type MastraModelConfig,
    type ModelRouterModelId,
    type OpenAICompatibleConfig,
    type ModelRouterLanguageModel,
} from '@mastra/core/llm';
import { MastraCompositeStore } from '@mastra/core/storage';
import { Memory } from '@mastra/memory';
import { createCanonicalMastra } from '../../../../mastra/composition.js';
import type {
    TutorAccountingPort,
    TutorRunInput,
    TutorRunner,
} from '../../application/ports/tutor-runner.js';
import {
    createTutorModelGate,
    type TutorProviderModel,
} from './accounted-tutor-model.js';
import {
    ConversationMemoryStorage,
    toTutorModelMessage,
} from './conversation-memory-storage.js';
import { createContextualTutorTools } from './contextual-tutor-tools.js';
import { ConversationError } from '../../domain/conversation.js';

type TutorModelConfiguration =
    | ModelRouterModelId
    | OpenAICompatibleConfig
    | ModelRouterLanguageModel
    | TutorProviderModel;

function isConstructedModelAdapter(model: TutorModelConfiguration) {
    // Constructed SDK adapters already expose their protocol version. Model IDs
    // and provider configuration must first be resolved by Mastra.
    return typeof model === 'object' && 'specificationVersion' in model;
}

function requireSupportedTutorModel(
    model:
        | Awaited<ReturnType<typeof resolveModelConfig>>
        | Extract<TutorModelConfiguration, { specificationVersion: string }>,
) {
    // The accounting gate and pinned streaming integration require v2 adapters.
    if (model.specificationVersion !== 'v2') {
        throw new Error(
            'AI is unavailable right now. Your messages are kept. Try again later.',
        );
    }

    return model;
}

function createTutorMemory(options: {
    conversationId: string;
    storage: ConversationMemoryStorage;
    model: ReturnType<typeof requireSupportedTutorModel>;
    modelGate: ReturnType<typeof createTutorModelGate>;
    thresholds: ReturnType<typeof tutorMemoryThresholds>;
}) {
    const { model, modelGate, thresholds } = options;
    const memory = new Memory({
        storage: new MastraCompositeStore({
            id: `conversation:${options.conversationId}`,
            domains: { memory: options.storage },
            disableInit: true,
        }),
        options: {
            lastMessages: 20,
            generateTitle: false,
            semanticRecall: false,
            workingMemory: { enabled: false },
            observationalMemory: {
                scope: 'thread',
                retrieval: { scope: 'thread', vector: false },
                shareTokenBudget: false,
                activateAfterIdle: false,
                activateOnProviderChange: false,
                observation: {
                    model: modelGate.wrap(model, 'observation'),
                    messageTokens: thresholds.messageTokens,
                    maxTokensPerBatch: thresholds.maxTokensPerBatch,
                    bufferTokens: false,
                    bufferOnIdle: false,
                    threadTitle: false,
                    modelSettings: {
                        maxRetries: 0,
                        maxOutputTokens: 2048,
                    },
                },
                reflection: {
                    model: modelGate.wrap(model, 'reflection'),
                    observationTokens: thresholds.observationTokens,
                    activateAfterIdle: false,
                    activateOnProviderChange: false,
                    modelSettings: {
                        maxRetries: 0,
                        maxOutputTokens: 2048,
                    },
                },
            },
        },
    });

    memory.__setLogger(noopLogger);

    return memory;
}

export function tutorMemoryThresholds(
    maxInputTokens: number,
    reservedInputBytes = 0,
) {
    const available = maxInputTokens - reservedInputBytes;
    if (
        !Number.isSafeInteger(maxInputTokens) ||
        !Number.isSafeInteger(reservedInputBytes) ||
        reservedInputBytes < 0 ||
        available < 4096
    ) {
        throw new Error(
            'This conversation is too long for an AI response. Start a fresh chat.',
        );
    }

    return {
        // The dispatch gate conservatively budgets UTF-8 bytes as tokens. Keep
        // space for observer instructions, prior observations and tool schemas.
        messageTokens: Math.min(16_000, Math.floor(available / 8)),
        observationTokens: Math.min(8_000, Math.floor(available / 16)),
        maxTokensPerBatch: Math.min(16_000, Math.floor(available / 8)),
    };
}

/** Registry factory; executable instances receive only operation-bound models, memory and tools. */
export function createContextualTutorAgent(options: {
    model: MastraModelConfig;
    memory?: Memory;
    tools?: ReturnType<typeof createContextualTutorTools>;
    contextInstructions?: string;
}) {
    const agent = new Agent({
        id: 'contextual-language-tutor',
        name: 'Contextual language tutor',
        instructions: `${getLocalPrompt('contextual-language-tutor')}\n${options.contextInstructions ?? ''}`,
        model: options.model,
        ...(options.memory ? { memory: options.memory } : {}),
        ...(options.tools ? { tools: options.tools } : {}),
        defaultOptions: {
            maxSteps: 3,
            modelSettings: { maxRetries: 0, maxOutputTokens: 4096 },
        },
        defaultGenerateOptionsLegacy: { maxRetries: 0, maxSteps: 1 },
        defaultStreamOptionsLegacy: { maxRetries: 0, maxSteps: 1 },
    });

    agent.__registerPrimitives({ logger: noopLogger });

    return agent;
}

export function createContextualTutorRunner(options: {
    model: TutorModelConfiguration;
    accounting: TutorAccountingPort;
    attemptWitness?: Omit<TextAiProviderAttemptWitness, 'attemptId'>;
    maxInputTokens: number;
    providerId?: string;
    /** Tests inject a deterministic model and small thresholds without paid provider access. */
    memoryThresholds?: ReturnType<typeof tutorMemoryThresholds>;
}): TutorRunner {
    return {
        async run(input: TutorRunInput) {
            const resolvedModel = requireSupportedTutorModel(
                isConstructedModelAdapter(options.model)
                    ? options.model
                    : await resolveModelConfig(options.model),
            );

            const modelGate = createTutorModelGate({
                accounting: options.accounting,
                ...(options.attemptWitness
                    ? { attemptWitness: options.attemptWitness }
                    : {}),
                signal: input.signal,
                maxInputTokens: options.maxInputTokens,
            });

            const memoryStorage = new ConversationMemoryStorage({
                conversationId: input.conversationId,
                ownerId: input.ownerId,
                createdAt: input.conversationCreatedAt,
                port: input.memory,
            });

            const contextInstructions = tutorContextInstructions(input);
            const reservedInputBytes = tutorReservedInputBytes(input);
            let memoryThresholds: ReturnType<typeof tutorMemoryThresholds>;

            try {
                memoryThresholds =
                    options.memoryThresholds ??
                    tutorMemoryThresholds(
                        options.maxInputTokens,
                        reservedInputBytes,
                    );
            } catch {
                throw new ConversationError(
                    'context_too_large',
                    'The complete editor and references exceed the model input limit. Reduce the editor text or references and try again.',
                );
            }

            const memory = createTutorMemory({
                conversationId: input.conversationId,
                storage: memoryStorage,
                model: resolvedModel,
                modelGate,
                thresholds: memoryThresholds,
            });

            const tools = createContextualTutorTools({
                ...input,
                signal: modelGate.signal,
            });
            const operationAgent = createContextualTutorAgent({
                model: modelGate.wrap(resolvedModel, 'answer'),
                memory,
                tools,
                contextInstructions,
            });
            const agent = createCanonicalMastra({
                contextualTutor: { agent: operationAgent, tools },
            }).getAgent('contextualLanguageTutor');

            let text = '';
            let currentMessageId = input.operationId;

            try {
                // The pinned SDK only performs threshold observation from step 1 onward.
                // Compact retained history synchronously before the first actor dispatch as well.
                const engine = await memory.omEngine;

                if (!engine) {
                    throw new Error(
                        'Conversation observational memory is unavailable.',
                    );
                }

                await engine.observe({
                    threadId: input.conversationId,
                    resourceId: input.ownerId,
                });

                modelGate.signal.throwIfAborted();
                const stream = await agent.stream(
                    [
                        toTutorModelMessage(
                            input.message,
                            input.conversationId,
                            input.ownerId,
                        ),
                    ],
                    {
                        runId: input.operationId,
                        abortSignal: modelGate.signal,
                        memory: {
                            thread: input.conversationId,
                            resource: input.ownerId,
                            options: { filterIncompleteToolCalls: true },
                        },
                        maxSteps: 3,
                        modelSettings: { maxRetries: 0, maxOutputTokens: 4096 },
                    },
                );

                for await (const chunk of stream.fullStream) {
                    if (
                        chunk.type === 'step-start' &&
                        chunk.payload.messageId
                    ) {
                        currentMessageId = chunk.payload.messageId;
                    }

                    if (chunk.type === 'text-delta') {
                        text += chunk.payload.text;
                        await input.onDelta({
                            messageId: currentMessageId,
                            text: chunk.payload.text,
                        });
                    }

                    if (chunk.type === 'error') {
                        if (modelGate.contextExceeded) {
                            throw new ConversationError(
                                'context_too_large',
                                'The complete editor, references and conversation exceed the model input limit after compaction. Reduce the editor text or references and try again.',
                            );
                        }

                        throw new Error(
                            'The language provider could not complete this response.',
                        );
                    }
                }

                const output = await stream.getFullOutput();

                if (
                    (output.error || output.finishReason === 'error') &&
                    modelGate.contextExceeded
                ) {
                    throw new ConversationError(
                        'context_too_large',
                        'The complete editor, references and conversation exceed the model input limit after compaction. Reduce the editor text or references and try again.',
                    );
                }

                if (output.error || output.finishReason === 'error') {
                    throw new Error(
                        'The response could not be completed or persisted.',
                    );
                }

                modelGate.signal.throwIfAborted();

                return { text };
            } catch (error) {
                modelGate.abort(error);

                if (modelGate.contextExceeded) {
                    throw new ConversationError(
                        'context_too_large',
                        'The complete editor, references and conversation exceed the model input limit after compaction. Reduce the editor text or references and try again.',
                    );
                }

                if (modelGate.providerFailure && options.providerId) {
                    throw new ProviderExecutionError(
                        modelGate.providerFailure.error,
                        options.providerId,
                    );
                }

                throw error;
            }
        },
    };
}
