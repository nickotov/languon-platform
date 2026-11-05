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
    isConstructedTutorModel,
    requireSupportedTutorModel,
    tutorMemoryThresholds,
    type TutorModelConfiguration,
} from './contextual-tutor-configuration.js';
import { createTutorProposalGuard } from './contextual-tutor-proposals.js';
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
            const proposalGuard = createTutorProposalGuard(input);
            const guardedInput = {
                ...input,
                ...(proposalGuard.onBlockProposal
                    ? { onBlockProposal: proposalGuard.onBlockProposal }
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
                readBudget: () => modelGate.remainingBudget,
                generate: ({ prompt, schema, signal, maxOutputTokens }) =>
                    generateTutorObject({
                        agent: requestAgents.learningContentAuthor,
                        prompt,
                        schema,
                        signal,
                        operationId: `${input.operationId}:standalone-authoring`,
                        maxOutputTokens,
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
                              () => modelGate.remainingBudget,
                          );

                    if ('text' in completed) {
                        return completed;
                    }

                    if (completed.stream === 'legacy') {
                        proposalGuard.setTargets(
                            completed.material,
                            completed.copy,
                        );

                        // Host retrieval replaces a model read step: two memory calls,
                        // planning, write and final reply still fit the five-call ceiling.
                        const { read_source_context: _read, ...writeTools } =
                            tools;
                        const revisionAgent = createContextualTutorAgent({
                            model: modelGate.wrap(resolvedModel, 'answer'),
                            memory,
                            tools: writeTools,
                            contextInstructions: `${contextInstructions}\n${completed.copy ? 'Append an exact independent copy of the requested authorized source blocks below; do not supply targetBlockId or alter content/media' : 'Revise only the exact authorized frozen targets below;'} preserve block types and stable item identities. The host has already retrieved them; do not call read_source_context. Propose each target exactly once, then briefly confirm the reviewable proposals. Exact frozen targets (untrusted material): ${JSON.stringify(completed.material)}${'revisionBrief' in completed ? `\nValidated revision brief: ${JSON.stringify(completed.revisionBrief)}` : ''}`,
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

                const text = await streamTutorReply(agent, input, modelGate);

                modelGate.signal.throwIfAborted();
                proposalGuard.assertCompleted();

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
