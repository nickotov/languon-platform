import { readTutorPlannerState } from '../../application/tutor-planner-prompt';
import { tutorRequestStateKey } from '../../application/tutor-request-contract';
import { createTutorHistoryTool } from './tutor-history-tool';
import {
    createTutorRequestAgents,
    generateTutorObject,
} from './tutor-request-agents';
import {
    createLearningContentTools,
    resolveLearningToolSources,
} from './learning-content-tools';
import { executeTutorRequest } from './tutor-request-execution';
import type { TextAiProviderAttemptWitness } from '../../../text-ai/infrastructure/ai/text-ai-provider-attempt-context.js';
import { ProviderExecutionError } from '../../../text-ai/infrastructure/ai/provider-execution-outcome';
import {
    tutorContextInstructions,
    tutorReservedInputBytes,
} from '../../application/tutor-context-budget';
import { createCanonicalMastra } from '../../../../mastra/composition.js';
import { resolveModelConfig } from '@mastra/core/llm';
import type {
    TutorAccountingPort,
    TutorRunInput,
    TutorRunner,
} from '../../application/ports/tutor-runner.js';
import { createTutorModelGate } from './accounted-tutor-model.js';
import { ConversationMemoryStorage } from './conversation-memory-storage.js';
import { createContextualTutorTools } from './contextual-tutor-tools.js';
import { ConversationError } from '../../domain/conversation.js';
import {
    createContextualTutorAgent,
    createTutorMemory,
    createTutorPersistenceMemory,
    isConstructedTutorModel,
    requireSupportedTutorModel,
    tutorMemoryThresholds,
    type TutorModelConfiguration,
} from './contextual-tutor-configuration.js';
import { prepareTutorHistory } from './tutor-history-context';
import { streamTutorReply } from './contextual-tutor-stream.js';

export {
    createContextualTutorAgent,
    tutorMemoryThresholds,
} from './contextual-tutor-configuration.js';

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
                isConstructedTutorModel(options.model)
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
            const reservedInputBytes = tutorReservedInputBytes(
                input,
                readTutorPlannerState(
                    await input.memory.readState(tutorRequestStateKey),
                ),
            );
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

            const persistenceMemory =
                createTutorPersistenceMemory(memoryStorage);
            const routeKnowledgeRequest =
                input.canProposeBlocks &&
                !input.readOnlySource &&
                input.sourceContext.sourceKind === 'knowledge' &&
                input.sourceContext.snapshotScope === 'workspace';
            const tools = {
                ...createContextualTutorTools({
                    ...input,
                    signal: modelGate.signal,
                }),
                recall: createTutorHistoryTool(input.memory, modelGate.signal),
            };
            const requestAgents = createTutorRequestAgents({
                planningModel: modelGate.wrap(resolvedModel, 'planning'),
                authoringModel: modelGate.wrap(resolvedModel, 'authoring'),
            });
            const learningContentTools =
                input.canProposeBlocks &&
                !input.readOnlySource &&
                input.onBlockProposal
                    ? createLearningContentTools({
                          signal: modelGate.signal,
                          resolveSources: (brief) =>
                              resolveLearningToolSources(input, brief),
                          publish: (proposal) => {
                              if (!input.onBlockProposal) {
                                  throw new Error(
                                      'This operation cannot publish learning proposals.',
                                  );
                              }

                              return input.onBlockProposal(proposal);
                          },
                          readBudget: () => modelGate.remainingBudget,
                          generate: ({
                              prompt,
                              schema,
                              signal,
                              maxOutputTokens,
                          }) =>
                              generateTutorObject({
                                  agent: requestAgents.learningContentAuthor,
                                  prompt,
                                  schema,
                                  signal,
                                  operationId: `${input.operationId}:standalone-authoring`,
                                  maxOutputTokens,
                              }),
                      })
                    : undefined;

            try {
                const prepared = await prepareTutorHistory(memory, input);
                let agent = createCanonicalMastra({
                    contextualTutor: {
                        agent: createContextualTutorAgent({
                            model: modelGate.wrap(resolvedModel, 'answer'),
                            memory: persistenceMemory,
                            persistenceStorage: memoryStorage,
                            tools,
                            contextInstructions: `${contextInstructions}\n${prepared.planner.observations ?? ''}`,
                        }),
                        tools,
                        requestAgents,
                        ...(learningContentTools
                            ? { learningContentTools }
                            : {}),
                    },
                }).getAgent('contextualLanguageTutor');

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
                              () => modelGate.remainingBudget,
                              prepared.planner,
                          );

                    if ('text' in completed) {
                        return completed;
                    }

                    if (completed.stream === 'prose') {
                        const readOnlyTools = {
                            ...createContextualTutorTools({
                                ...input,
                                readOnlySource: true,
                                signal: modelGate.signal,
                            }),
                            recall: createTutorHistoryTool(
                                input.memory,
                                modelGate.signal,
                            ),
                        };
                        const proseAgent = createContextualTutorAgent({
                            model: modelGate.wrap(resolvedModel, 'answer'),
                            memory: persistenceMemory,
                            persistenceStorage: memoryStorage,
                            tools: readOnlyTools,
                            contextInstructions: `${contextInstructions}\n${prepared.planner.observations ?? ''}\nThe validated response purpose is ${completed.purpose}. Answer in natural prose only. Do not generate learning blocks or invoke note-writing tools. Do not propose saving or adding this reply to a document; the application exposes a document action only when appropriate.`,
                        });

                        agent = createCanonicalMastra({
                            contextualTutor: {
                                agent: proseAgent,
                                tools: readOnlyTools,
                                requestAgents,
                                ...(learningContentTools
                                    ? { learningContentTools }
                                    : {}),
                            },
                        }).getAgent('contextualLanguageTutor');
                    }
                }

                const text = await streamTutorReply(
                    agent,
                    input,
                    modelGate,
                    prepared,
                );

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
