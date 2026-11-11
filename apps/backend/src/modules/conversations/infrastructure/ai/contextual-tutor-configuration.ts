import { getLocalPrompt } from '@languon/prompts';
import { Agent, type ToolsInput } from '@mastra/core/agent';
import { noopLogger } from '@mastra/core/logger';
import type {
    resolveModelConfig,
    MastraModelConfig,
    ModelRouterModelId,
    OpenAICompatibleConfig,
    ModelRouterLanguageModel,
} from '@mastra/core/llm';
import { MastraCompositeStore } from '@mastra/core/storage';
import { MessageHistory } from '@mastra/core/processors';
import { Memory } from '@mastra/memory';
import type {
    createTutorModelGate,
    TutorProviderModel,
} from './accounted-tutor-model.js';
import type { ConversationMemoryStorage } from './conversation-memory-storage.js';

export type TutorModelConfiguration =
    | ModelRouterModelId
    | OpenAICompatibleConfig
    | ModelRouterLanguageModel
    | TutorProviderModel;

export function isConstructedTutorModel(model: TutorModelConfiguration) {
    // Constructed SDK adapters already expose their protocol version. Model IDs
    // and provider configuration must first be resolved by Mastra.
    return typeof model === 'object' && 'specificationVersion' in model;
}

export function requireSupportedTutorModel(
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

export function createTutorMemory(options: {
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

/** Persistence shares the canonical adapter but cannot trigger another OM pass. */
export function createTutorPersistenceMemory(
    storage: ConversationMemoryStorage,
) {
    const memory = new Memory({
        storage: new MastraCompositeStore({
            id: 'conversation-persistence',
            domains: { memory: storage },
            disableInit: true,
        }),
        options: {
            lastMessages: false,
            observationalMemory: false,
            semanticRecall: false,
            workingMemory: { enabled: false },
            generateTitle: false,
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
    tools?: ToolsInput;
    contextInstructions?: string;
    persistenceStorage?: ConversationMemoryStorage;
}) {
    const agent = new Agent({
        id: 'contextual-language-tutor',
        name: 'Contextual language tutor',
        instructions: `${getLocalPrompt('contextual-language-tutor')}\n${options.contextInstructions ?? ''}`,
        model: options.model,
        ...(options.persistenceStorage
            ? {
                  outputProcessors: [
                      new MessageHistory({
                          storage: options.persistenceStorage,
                      }),
                  ],
              }
            : {}),
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
