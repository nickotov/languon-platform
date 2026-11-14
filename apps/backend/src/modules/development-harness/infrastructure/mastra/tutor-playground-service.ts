import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { resolveModelConfig } from '@mastra/core/llm';
import { createTextAiProviderRuntime } from '../../../../infrastructure/text-ai/provider-runtime';
import { createTextAiRouteFingerprint } from '../../../../infrastructure/text-ai/route-fingerprint';
import { resolveTextAiProviderOptions } from '../../../text-ai/infrastructure/ai/text-ai-provider-resolver';
import type { TextAiProviderCredentials } from '../../../text-ai/application/text-ai-provider-catalog';
import type { TextAiAdmissionExecution } from '../../../text-ai/application/text-ai-admission-participant';
import {
    conversationAdmission,
    createConversationAccounting,
    settleInterruptedConversationCalls,
} from '../../../conversations/infrastructure/conversation-accounting';
import {
    type ConversationTurn,
    type ConversationResponseMetadata,
} from '@languon/contracts';
import { ConversationWorkerService } from '../../../conversations/application/conversation-worker-service';
import type {
    TutorAccountingPort,
    TutorRunInput,
} from '../../../conversations/application/ports/tutor-runner';
import { DrizzleConversationStore } from '../../../conversations/infrastructure/persistence/drizzle/drizzle-conversation-store';
import {
    ConversationSourceResolver,
    type ConversationsDatabase,
} from '../../../conversations/infrastructure/persistence/drizzle/conversation-source';
import { DrizzleKnowledgeTransactionParticipant } from '../../../knowledge/infrastructure/persistence/drizzle/knowledge-transaction';
import { createContextualTutorRunner } from '../../../conversations/infrastructure/ai/contextual-tutor-runner';
import { createTutorModelGate } from '../../../conversations/infrastructure/ai/accounted-tutor-model';
import {
    createTutorRequestAgents,
    generateTutorObject,
} from '../../../conversations/infrastructure/ai/tutor-request-agents';
import {
    createLearningContentTools,
    createNamedExerciseTools,
    namedExerciseActivityForToolId,
    namedExerciseToolDefinition,
    type LearningContentToolOptions,
    type NamedExerciseToolId,
    resolveLearningToolSources,
} from '../../../conversations/infrastructure/ai/learning-content-tools';
import {
    requireSupportedTutorModel,
    isConstructedTutorModel,
    type TutorModelConfiguration,
} from '../../../conversations/infrastructure/ai/contextual-tutor-configuration';
import { readTutorPlannerState } from '../../../conversations/application/tutor-planner-prompt';
import { tutorRequestStateKey } from '../../../conversations/application/tutor-request-contract';
import { describeLearningProposal } from '../../../conversations/infrastructure/ai/tutor-request-proposals';
import { learningContentRegistry } from '../../../conversations/application/learning-content-registry';
import type { ExerciseAuthoringSource } from '../../../conversations/infrastructure/ai/exercise-authoring-context';
import { createPlaygroundModel } from './tutor-playground-model';
import { capturePlaygroundModel } from './tutor-playground-diagnostics';
import {
    createPlaygroundSessions,
    playgroundAccess,
} from './tutor-playground-sessions';
import type {
    TutorPlaygroundContext,
    TutorPlaygroundTurnInput,
} from './tutor-playground-contract';

export interface TutorPlaygroundOptions {
    database: ConversationsDatabase;
    mode?: 'deterministic' | 'live';
    credentials?: TextAiProviderCredentials;
}
type ToolId =
    | 'generate_vocabulary'
    | 'generate_grammar'
    | 'generate_bilingual_text'
    | 'generate_exercises'
    | NamedExerciseToolId;
const access = playgroundAccess;

/** Real source, turn leases and proposals; sandbox accounting never claims customer settlement proof. */
export function createTutorPlaygroundService(options: TutorPlaygroundOptions) {
    const database = options.database;
    let busy = false;
    const store = new DrizzleConversationStore({
        database,
        sources: new ConversationSourceResolver({
            verifyDictionaryShare: () => false,
            verifyTextShare: () => false,
            readNote: (tx, owner, id) =>
                new DrizzleKnowledgeTransactionParticipant(tx).getForSource(
                    owner,
                    id,
                ),
        }),
        admitTurn:
            options.mode === 'live'
                ? conversationAdmission({
                      // The explicit playground live opt-in enables routing, never DB readiness or funding.
                      routingEnabled: true,
                      pricingAdmissionEnabled: true,
                      routeFingerprint: createTextAiRouteFingerprint(
                          options.credentials ?? {},
                      ),
                      credentialConfigured: (providerId) =>
                          Boolean(
                              options.credentials?.[
                                  {
                                      deepseek: 'DEEPSEEK_API_KEY',
                                      kie: 'KIE_API_KEY',
                                      evolink: 'EVOLINK_API_KEY',
                                      openrouter: 'OPENROUTER_API_KEY',
                                  }[
                                      providerId
                                  ] as keyof TextAiProviderCredentials
                              ],
                          ),
                  })
                : async () => ({
                      playground: true,
                      admittedMaxInputTokens: 64_000,
                  }),
        ...(options.mode === 'live'
            ? { settleInterrupted: settleInterruptedConversationCalls }
            : {}),
        publishNote: (tx, owner, input) =>
            new DrizzleKnowledgeTransactionParticipant(tx).publish(
                owner,
                input,
            ),
    });

    const sessions = createPlaygroundSessions(database, store);

    async function exclusive<T>(signal: AbortSignal, run: () => Promise<T>) {
        signal.throwIfAborted();
        if (busy) {
            throw new Error(
                'One playground tutor/tool operation may run at a time.',
            );
        }

        busy = true;
        try {
            return await database.transaction(async (tx) => {
                // The DB lock covers other harness instances, while the local guard fails fast.
                const [lock] = await tx.execute<{ acquired: boolean }>(
                    sql`select pg_try_advisory_xact_lock(19871112, 14) as acquired`,
                );

                if (!lock?.acquired) {
                    throw new Error(
                        'Another playground tutor/tool operation is already running.',
                    );
                }

                return run();
            });
        } finally {
            busy = false;
        }
    }

    async function execute(
        context: TutorPlaygroundContext,
        message: string,
        signal: AbortSignal,
        direct?: { id: ToolId; data: Record<string, unknown> },
    ) {
        return exclusive(signal, async () => {
            const selected = await sessions.session(context);
            if (direct && context.scenarioId === 'read-only') {
                throw new Error(
                    'Read-only scenarios cannot generate author proposals.',
                );
            }

            const submitted = await store.submit(
                access,
                selected.conversationId,
                {
                    requestId: randomUUID(),
                    content: message,
                    attachments: [],
                    ...(context.scenarioId === 'read-only'
                        ? {}
                        : {
                              editorContext: await sessions.editor(
                                  selected.noteId,
                              ),
                          }),
                },
            );

            if ('quote' in submitted) {
                throw new Error('Unexpected playground financial admission.');
            }

            const diagnostics: {
                mode: string;
                accounting: string;
                calls: unknown[];
                modelIO: unknown[];
                metadata: ConversationResponseMetadata | null;
            } = {
                mode: options.mode ?? 'deterministic',
                accounting:
                    options.mode === 'live'
                        ? 'Authoritative playground action admission and provider expense settlement.'
                        : 'Synthetic bounded accounting; no customer credits are charged.',
                calls: [],
                modelIO: [],
                metadata: null,
            };
            const accounting: TutorAccountingPort = {
                admit: async (call) => {
                    signal.throwIfAborted();
                    diagnostics.calls.push({ ...call, status: 'admitted' });
                },
                settle: async (call, usage) => {
                    diagnostics.calls.push({
                        callId: call.callId,
                        status: 'settled',
                        usage: {
                            inputTokens: usage.inputTokens,
                            outputTokens: usage.outputTokens,
                        },
                    });
                },
                fail: async (call, reason) => {
                    diagnostics.calls.push({
                        callId: call.callId,
                        status: 'failed',
                        reason,
                    });
                },
            };
            let toolResult: unknown;
            const scopedStore = new Proxy(store, {
                get(target, property) {
                    if (property === 'claim') {
                        return () =>
                            target.claimForTurn(submitted.id, access.ownerId);
                    }

                    const value: unknown = Reflect.get(
                        target,
                        property,
                        target,
                    );

                    return typeof value === 'function'
                        ? value.bind(target)
                        : value;
                },
            });
            const worker = new ConversationWorkerService({
                store: scopedStore,
                createRunner: async (claimed) => {
                    if (
                        claimed.id !== submitted.id ||
                        claimed.conversationId !== selected.conversationId
                    ) {
                        throw new Error(
                            'The playground worker claimed a different operation.',
                        );
                    }

                    const execution =
                        claimed.execution as unknown as TextAiAdmissionExecution;
                    let activeAccounting = accounting;
                    let activeModel = createPlaygroundModel(
                        () => undefined,
                    ) as ReturnType<typeof requireSupportedTutorModel>;

                    if (options.mode === 'live') {
                        if (!execution.snapshot) {
                            throw new Error(
                                'Configure a reviewed conversation route, native pricing, capability policy and bounded operator budget in the isolated playground database before live execution.',
                            );
                        }

                        const credentials = options.credentials ?? {};
                        const provider = resolveTextAiProviderOptions({
                            ...createTextAiProviderRuntime(
                                database,
                                credentials,
                            ),
                            snapshot: execution.snapshot,
                            budget: execution.budget,
                            credentials,
                        });

                        activeModel = requireSupportedTutorModel(
                            isConstructedTutorModel(provider.model)
                                ? provider.model
                                : await resolveModelConfig(provider.model),
                        );

                        const durable = createConversationAccounting({
                            database,
                            withOperation: (work) =>
                                store.withOperation(claimed, work),
                            ownerId: claimed.ownerId,
                            turnId: claimed.id,
                            leaseToken: claimed.leaseToken,
                            execution,
                        });

                        activeAccounting = {
                            admit: async (call) => {
                                const result = await durable.admit(call);
                                await accounting.admit(call);

                                return result;
                            },
                            settle: async (call, usage) => {
                                await durable.settle(call, usage);
                                await accounting.settle(call, usage);
                            },
                            fail: async (call, reason, usage) => {
                                await durable.fail(call, reason, usage);
                                await accounting.fail(call, reason, usage);
                            },
                        };
                    }

                    const model = capturePlaygroundModel(
                        activeModel,
                        diagnostics.modelIO,
                    );
                    const witness =
                        options.mode === 'live'
                            ? {
                                  jobId: claimed.id,
                                  leaseToken: claimed.leaseToken,
                              }
                            : undefined;

                    return {
                        run: async (input) => {
                            const scoped = {
                                ...input,
                                onResponseMetadata: async (
                                    metadata: ConversationResponseMetadata,
                                ) => {
                                    diagnostics.metadata = metadata;
                                    await input.onResponseMetadata?.(metadata);
                                },
                            };

                            if (!direct) {
                                return createContextualTutorRunner({
                                    model: model as TutorModelConfiguration,
                                    accounting: activeAccounting,
                                    ...(witness
                                        ? { attemptWitness: witness }
                                        : {}),
                                    maxInputTokens: 64_000,
                                }).run(scoped);
                            }

                            const result = await executeDirect(
                                scoped,
                                direct,
                                model,
                                activeAccounting,
                                witness,
                            );

                            toolResult = result;
                            const text = JSON.stringify(result);
                            await input.onDelta({
                                messageId: input.operationId,
                                text,
                            });

                            await input.memory.saveMessages([
                                input.message,
                                {
                                    id: randomUUID(),
                                    role: 'assistant',
                                    content: text,
                                    createdAt: new Date().toISOString(),
                                },
                            ]);

                            return { text };
                        },
                    };
                },
            });

            try {
                const claimed = await worker.processNext(signal);
                if (!claimed) {
                    throw new Error(
                        'The playground turn could not start. Another synthetic turn may still hold a worker lease; wait for lease recovery before retrying.',
                    );
                }
            } catch (error) {
                // Admission is durable. A cancelled/pre-claim failure must not strand queued work.
                await store.stop(access, selected.conversationId, submitted.id);

                throw error;
            }

            const detail = await store.detail(access, selected.conversationId);
            const turn = detail.turns.find(
                (item: ConversationTurn) => item.id === submitted.id,
            );

            if (
                !turn ||
                !['succeeded', 'failed', 'cancelled'].includes(turn.status)
            ) {
                await store.stop(access, selected.conversationId, submitted.id);

                throw new Error(
                    'The playground operation did not reach a terminal result.',
                );
            }

            const proposals = await store.listBlockProposals(
                access,
                selected.conversationId,
            );

            return {
                sessionId: selected.conversationId,
                turnId: submitted.id,
                status: turn?.status ?? 'failed',
                failureCode: turn.failureCode,
                response: detail.messages
                    .filter(
                        (item) =>
                            item.turnId === submitted.id &&
                            item.role === 'assistant',
                    )
                    .map((item) => item.content)
                    .join(''),
                proposals: proposals.proposals,
                diagnostics,
                ...(direct ? { result: toolResult ?? null } : {}),
            };
        });
    }

    async function executeDirect(
        input: TutorRunInput,
        direct: { id: ToolId; data: Record<string, unknown> },
        model: ReturnType<typeof requireSupportedTutorModel>,
        accounting: TutorAccountingPort,
        witness?: { jobId: string; leaseToken: string },
    ) {
        const gate = createTutorModelGate({
            accounting,
            ...(witness ? { attemptWitness: witness } : {}),
            signal: input.signal,
            maxInputTokens: 64_000,
        });
        const agents = createTutorRequestAgents({
            planningModel: gate.wrap(model, 'planning'),
            authoringModel: gate.wrap(model, 'authoring'),
        });
        const taskSources = new Map<string, ExerciseAuthoringSource>();
        const toolOptions: LearningContentToolOptions = {
            signal: gate.signal,
            publish: input.onBlockProposal!,
            taskSources,
            resolveSources: (brief) =>
                resolveLearningToolSources(input, brief, taskSources),
            readBudget: () => gate.remainingBudget,
            generate: (call) =>
                generateTutorObject({
                    agent: agents.learningContentAuthor,
                    prompt: call.prompt,
                    schema: call.schema,
                    signal: call.signal,
                    operationId: input.operationId,
                    maxOutputTokens: call.maxOutputTokens,
                }),
        };
        const activityId = namedExerciseActivityForToolId(direct.id);
        const capability = learningContentRegistry.find(
            (item) => item.toolId === direct.id,
        );

        if (!activityId && !capability) {
            throw new Error('The requested playground tool is not registered.');
        }

        let result: unknown;
        if (activityId) {
            const definition = namedExerciseToolDefinition(activityId);
            const tools = createNamedExerciseTools(toolOptions);
            result = await tools[definition.id].execute!(
                definition.inputSchema.parse(direct.data),
                { abortSignal: gate.signal } as never,
            );
        } else {
            const tools = createLearningContentTools(toolOptions);
            result = await tools[capability!.toolId].execute!(
                capability!.inputSchema.parse(direct.data),
                { abortSignal: gate.signal } as never,
            );
        }

        if (
            result &&
            typeof result === 'object' &&
            'status' in result &&
            result.status === 'ready' &&
            'receipt' in result
        ) {
            const receipt = result.receipt as {
                proposalId: string;
                summary: string;
            };
            const proposal = await input.readBlockProposal!(receipt.proposalId);
            const state = readTutorPlannerState(
                await input.memory.readState(tutorRequestStateKey),
            );

            state.proposals.push(
                describeLearningProposal(
                    proposal.id,
                    proposal.blocks,
                    receipt.summary,
                    state.proposals.length + 1,
                ),
            );

            await input.memory.writeState({
                [tutorRequestStateKey]: {
                    pending: null,
                    proposals: state.proposals.slice(-8),
                },
            });
        }

        return result;
    }

    return {
        runTurn: (input: TutorPlaygroundTurnInput, signal: AbortSignal) =>
            execute(input, input.message, signal),
        runTool: (
            id: ToolId,
            data: Record<string, unknown>,
            context: TutorPlaygroundContext,
            signal: AbortSignal,
        ) =>
            execute(context, `Direct Studio tool: ${id}`, signal, { id, data }),
        readProposal: sessions.readProposal,
    };
}
