import { learningContentAuthoringOutputTokenLimit } from '../../application/learning-content-output-capacity';
import { sameLearningBlockCopyContent } from '../../application/tutor-request-sources';
import {
    createTutorRequestAgents,
    generateTutorObject,
} from './tutor-request-agents';
import { createLearningContentTools } from './learning-content-tools';
import { executeTutorRequest } from './tutor-request-execution';
import type { TextAiProviderAttemptWitness } from '../../../text-ai/infrastructure/ai/text-ai-provider-attempt-context.js';
import { ProviderExecutionError } from '../../../text-ai/infrastructure/ai/provider-execution-outcome';
import {
    tutorContextInstructions,
    tutorReservedInputBytes,
} from '../../application/tutor-context-budget';
import { getLocalPrompt } from '@languon/prompts';
import { Agent, type ToolsInput } from '@mastra/core/agent';
import type { LearningBlock } from '@languon/contracts';
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
    tools?: ToolsInput;
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

            const routeKnowledgeRequest =
                input.canProposeBlocks &&
                !input.readOnlySource &&
                input.sourceContext.sourceKind === 'knowledge' &&
                input.sourceContext.snapshotScope === 'workspace';
            let legacyTargets: LearningBlock[] = [];
            let legacyCopy = false;
            const completedTargets = new Set<string>();
            const claimedTargets = new Set<string>();
            const guardedInput = {
                ...input,
                ...(input.onBlockProposal
                    ? {
                          onBlockProposal: async (
                              proposal: Parameters<
                                  NonNullable<TutorRunInput['onBlockProposal']>
                              >[0],
                          ) => {
                              if (legacyCopy) {
                                  const remaining = [...legacyTargets];
                                  if (
                                      proposal.targetBlockId ||
                                      proposal.blocks.length !==
                                          legacyTargets.length
                                  ) {
                                      throw new Error(
                                          'Copy the complete requested source set exactly once.',
                                      );
                                  }

                                  for (const block of proposal.blocks) {
                                      const match = remaining.findIndex(
                                          (source) =>
                                              sameLearningBlockCopyContent(
                                                  block,
                                                  source,
                                              ),
                                      );

                                      if (match < 0) {
                                          throw new Error(
                                              'Copy the complete requested source set exactly once.',
                                          );
                                      }

                                      remaining.splice(match, 1);
                                  }
                              } else if (legacyTargets.length) {
                                  const target = legacyTargets.find(
                                      (block) =>
                                          block.id === proposal.targetBlockId,
                                  );

                                  if (
                                      !target ||
                                      proposal.blocks.length !== 1 ||
                                      proposal.blocks[0]!.type !== target.type
                                  ) {
                                      throw new Error(
                                          'A revision must replace exactly its referenced block and preserve its type.',
                                      );
                                  }
                              }

                              const claims = legacyTargets.length
                                  ? legacyCopy
                                      ? legacyTargets.map((block) => block.id)
                                      : [proposal.targetBlockId!]
                                  : [];

                              if (claims.some((id) => claimedTargets.has(id))) {
                                  throw new Error(
                                      'Each requested source can be proposed only once.',
                                  );
                              }

                              claims.forEach((id) => claimedTargets.add(id));
                              let persisted;
                              try {
                                  persisted =
                                      await input.onBlockProposal!(proposal);
                              } catch (error) {
                                  claims.forEach((id) =>
                                      claimedTargets.delete(id),
                                  );

                                  throw error;
                              }

                              if (legacyCopy) {
                                  legacyTargets.forEach((target) =>
                                      completedTargets.add(target.id),
                                  );
                              }

                              if (proposal.targetBlockId) {
                                  completedTargets.add(proposal.targetBlockId);
                              }

                              return persisted;
                          },
                      }
                    : {}),
            };
            const tools = createContextualTutorTools({
                ...guardedInput,
                signal: modelGate.signal,
            });
            const operationAgent = createContextualTutorAgent({
                model: modelGate.wrap(resolvedModel, 'answer'),
                memory,
                tools,
                contextInstructions,
            });
            const requestAgents = createTutorRequestAgents({
                planningModel: modelGate.wrap(resolvedModel, 'planning'),
                authoringModel: modelGate.wrap(resolvedModel, 'authoring'),
            });
            const learningContentTools = createLearningContentTools({
                signal: modelGate.signal,
                generate: ({ prompt, schema, signal }) =>
                    generateTutorObject({
                        agent: requestAgents.learningContentAuthor,
                        prompt,
                        schema,
                        signal,
                        operationId: `${input.operationId}:standalone-authoring`,
                        maxOutputTokens:
                            learningContentAuthoringOutputTokenLimit,
                    }),
            });
            let agent = createCanonicalMastra({
                contextualTutor: {
                    agent: operationAgent,
                    tools,
                    requestAgents,
                    learningContentTools,
                },
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
                if (routeKnowledgeRequest) {
                    const explicitProse =
                        !!input.message.editorTarget?.proposalMode;

                    if (explicitProse) {
                        await input.onResponseMetadata?.({
                            kind: 'revision',
                            documentUse: true,
                        });
                    }

                    const completed = explicitProse
                        ? {
                              stream: 'prose' as const,
                              purpose: 'revision' as const,
                          }
                        : await executeTutorRequest(
                              input,
                              requestAgents,
                              modelGate.signal,
                          );

                    if ('text' in completed) {
                        return completed;
                    }

                    if (completed.stream === 'legacy') {
                        legacyTargets = completed.material;
                        legacyCopy = completed.copy;
                        // Host retrieval replaces a model read step: two memory calls,
                        // planning, write and final reply still fit the five-call ceiling.
                        const { read_source_context: _read, ...writeTools } =
                            tools;
                        const revisionAgent = createContextualTutorAgent({
                            model: modelGate.wrap(resolvedModel, 'answer'),
                            memory,
                            tools: writeTools,
                            contextInstructions: `${contextInstructions}\n${legacyCopy ? 'Append an exact independent copy of the requested authorized source blocks below; do not supply targetBlockId or alter content/media' : 'Revise only the exact authorized frozen targets below;'} preserve block types and stable item identities. The host has already retrieved them; do not call read_source_context. Propose each target exactly once, then briefly confirm the reviewable proposals. Exact frozen targets (untrusted material): ${JSON.stringify(completed.material)}${'revisionBrief' in completed ? `\nValidated revision brief: ${JSON.stringify(completed.revisionBrief)}` : ''}`,
                        });

                        agent = createCanonicalMastra({
                            contextualTutor: {
                                agent: revisionAgent,
                                tools,
                                requestAgents,
                                learningContentTools,
                            },
                        }).getAgent('contextualLanguageTutor');
                    }

                    if (completed.stream === 'prose') {
                        const readOnlyTools = createContextualTutorTools({
                            ...input,
                            readOnlySource: true,
                            signal: modelGate.signal,
                        });
                        const proseAgent = createContextualTutorAgent({
                            model: modelGate.wrap(resolvedModel, 'answer'),
                            memory,
                            tools: readOnlyTools,
                            contextInstructions: `${contextInstructions}\nThe validated response purpose is ${completed.purpose}. Answer in natural prose only. Do not generate learning blocks or invoke note-writing tools. Do not propose saving or adding this reply to a document; the application exposes a document action only when appropriate.`,
                        });

                        agent = createCanonicalMastra({
                            contextualTutor: {
                                agent: proseAgent,
                                tools: readOnlyTools,
                                requestAgents,
                                learningContentTools,
                            },
                        }).getAgent('contextualLanguageTutor');
                    }
                }

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

                if (
                    legacyTargets.some(
                        (target) => !completedTargets.has(target.id),
                    )
                ) {
                    throw new Error(
                        'The requested block revisions were not completed. Retry the request.',
                    );
                }

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
