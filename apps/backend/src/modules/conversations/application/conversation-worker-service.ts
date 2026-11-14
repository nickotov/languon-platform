import { isReadOnlyKnowledgeSource } from '../domain/conversation';
import type {
    ClaimedConversationTurn,
    ConversationStore,
} from './ports/conversation-store';
import type { TutorRunner } from './ports/tutor-runner';
import { createTurnTextBuffer } from './turn-text-buffer';
import { ConversationError } from '../domain/conversation';
import { projectConversationSource } from './conversation-source-context';

export type ConversationWorkerStore = Pick<
    ConversationStore,
    | 'claim'
    | 'heartbeat'
    | 'append'
    | 'recordTool'
    | 'recordResponseMetadata'
    | 'propose'
    | 'proposeBlocks'
    | 'proposeBlockBatch'
    | 'readBlockProposal'
    | 'proposeDictionarySnippet'
    | 'readDictionarySnippet'
    | 'recordMaterial'
    | 'finish'
    | 'memory'
>;

/** Application process lifetime, not the HTTP subscription, owns a durable turn. */
export class ConversationWorkerService {
    constructor(
        private readonly dependencies: {
            store: ConversationWorkerStore;
            createRunner: (
                turn: ClaimedConversationTurn,
            ) => TutorRunner | Promise<TutorRunner>;
            heartbeatMs?: number;
            timeoutMs?: number;
        },
    ) {}

    async processNext(signal: AbortSignal): Promise<boolean> {
        signal.throwIfAborted();
        const turn = await this.dependencies.store.claim();
        if (!turn) {
            return false;
        }

        const controller = new AbortController();
        const combined = AbortSignal.any([
            signal,
            controller.signal,
            AbortSignal.timeout(this.dependencies.timeoutMs ?? 240_000),
        ]);
        const buffer = createTurnTextBuffer(
            (text) => this.dependencies.store.append(turn, text),
            (error) => controller.abort(error),
        );
        let heartbeatPending: Promise<void> | undefined;
        const timer = setInterval(() => {
            if (heartbeatPending) {
                return;
            }

            heartbeatPending = this.dependencies.store
                .heartbeat(turn)
                .catch(() => controller.abort())
                .finally(() => {
                    heartbeatPending = undefined;
                });
        }, this.dependencies.heartbeatMs ?? 5_000);

        try {
            const runner = await this.dependencies.createRunner(turn);
            const source = projectConversationSource(
                turn.source.kind,
                turn.sourceSnapshot,
                turn.message.content,
            );

            await runner.run({
                conversationId: turn.conversationId,
                readOnlySource: isReadOnlyKnowledgeSource(turn.source),
                ownerId: turn.ownerId,
                operationId: turn.id,
                conversationCreatedAt: turn.conversationCreatedAt,
                ...(turn.source.kind === 'knowledge'
                    ? {
                          sourceNote: {
                              noteId: turn.source.id,
                              noteVersion: Number(
                                  turn.sourceSnapshot.version.replace(
                                      /^draft:/u,
                                      '',
                                  ),
                              ),
                          },
                      }
                    : {}),
                message: turn.message,
                canProposeBlocks:
                    !!turn.sourceSnapshot.blockTarget &&
                    turn.source.kind === 'knowledge' &&
                    !isReadOnlyKnowledgeSource(turn.source),
                canProposeDictionarySnippet:
                    turn.source.kind === 'dictionary' &&
                    turn.authority.sourceOwnerId === turn.ownerId &&
                    !!turn.sourceSnapshot.dictionaryGenerationContext &&
                    !!this.dependencies.store.proposeDictionarySnippet &&
                    !!this.dependencies.store.readDictionarySnippet,
                onDictionarySnippet: async (proposal) => {
                    combined.throwIfAborted();
                    if (
                        turn.source.kind !== 'dictionary' ||
                        turn.authority.sourceOwnerId !== turn.ownerId ||
                        !turn.sourceSnapshot.dictionaryGenerationContext ||
                        !this.dependencies.store.proposeDictionarySnippet
                    ) {
                        throw new ConversationError(
                            'read_only_source',
                            'This source cannot propose dictionary cards.',
                        );
                    }

                    return this.dependencies.store.proposeDictionarySnippet(
                        turn,
                        proposal,
                    );
                },
                ...(this.dependencies.store.readDictionarySnippet
                    ? {
                          readDictionarySnippet: async (id: string) => {
                              combined.throwIfAborted();
                              const snippet = await this.dependencies.store
                                  .readDictionarySnippet!(turn, id);

                              combined.throwIfAborted();

                              return snippet;
                          },
                      }
                    : {}),
                onBlockProposal: async (proposal) => {
                    combined.throwIfAborted();
                    if (
                        turn.source.kind !== 'knowledge' ||
                        isReadOnlyKnowledgeSource(turn.source) ||
                        !turn.sourceSnapshot.blockTarget ||
                        !this.dependencies.store.proposeBlocks
                    ) {
                        throw new ConversationError(
                            'read_only_source',
                            'This source cannot propose learning blocks.',
                        );
                    }

                    return this.dependencies.store.proposeBlocks(
                        turn,
                        proposal,
                        combined,
                    );
                },
                onBlockProposals: async (proposals) => {
                    combined.throwIfAborted();
                    if (
                        turn.source.kind !== 'knowledge' ||
                        isReadOnlyKnowledgeSource(turn.source) ||
                        !turn.sourceSnapshot.blockTarget ||
                        !this.dependencies.store.proposeBlockBatch
                    ) {
                        throw new ConversationError(
                            'read_only_source',
                            'This source cannot propose learning blocks.',
                        );
                    }

                    return this.dependencies.store.proposeBlockBatch(
                        turn,
                        proposals,
                        combined,
                    );
                },
                ...(this.dependencies.store.readBlockProposal
                    ? {
                          readBlockProposal: async (id: string) => {
                              combined.throwIfAborted();
                              const result = await this.dependencies.store
                                  .readBlockProposal!(turn, id);

                              combined.throwIfAborted();

                              return result;
                          },
                      }
                    : {}),
                preferences: turn.preferences,
                sourceContext: source.initialContext,
                ...(turn.portraitContext
                    ? { portraitContext: turn.portraitContext }
                    : {}),
                memory: this.dependencies.store.memory(turn),
                signal: combined,
                onDelta: async ({ text }) => {
                    combined.throwIfAborted();
                    await buffer.append(text);
                },
                onResponseMetadata: async (metadata) => {
                    combined.throwIfAborted();
                    await buffer.flush();
                    await this.dependencies.store.recordResponseMetadata?.(
                        turn,
                        metadata,
                    );
                },
                onTool: async (call) => {
                    await buffer.flush();
                    await this.dependencies.store.recordTool(turn, call);
                },
                onDraft: async (content) => {
                    if (isReadOnlyKnowledgeSource(turn.source)) {
                        throw new ConversationError(
                            'read_only_source',
                            'Shared conversations cannot propose document changes.',
                        );
                    }

                    return this.dependencies.store.propose(
                        turn,
                        content,
                        turn.source.kind === 'knowledge'
                            ? {
                                  noteId: turn.source.id,
                                  version: Number(
                                      turn.sourceSnapshot.version.replace(
                                          /^draft:/u,
                                          '',
                                      ),
                                  ),
                              }
                            : undefined,
                    );
                },
                readContext: async ({ query, limit, blockIds }) => {
                    combined.throwIfAborted();
                    await this.dependencies.store.heartbeat(turn);
                    const selected = source.read({
                        query,
                        limit,
                        ...(blockIds ? { blockIds } : {}),
                    });

                    await this.dependencies.store.recordMaterial(
                        turn,
                        selected.material,
                    );

                    return selected;
                },
            });

            await buffer.flush();
            combined.throwIfAborted();
            await this.dependencies.store.finish(turn, 'succeeded');
        } catch (error) {
            // Save any partial text while the operation fence still permits it.
            await buffer.flush().catch(() => undefined);
            // Never re-dispatch a provider request automatically after an ambiguous failure.
            const failure =
                error instanceof ConversationError
                    ? error.code
                    : combined.aborted
                      ? 'response_interrupted'
                      : 'generation_failed';

            try {
                await this.dependencies.store.finish(
                    turn,
                    combined.aborted ? 'cancelled' : 'failed',
                    failure,
                );
            } catch (finishError) {
                if (!(finishError instanceof ConversationError)) {
                    throw finishError;
                } /* Expired/lost source is finalized by lease recovery without exposing content. */
            }
        } finally {
            buffer.dispose();
            clearInterval(timer);
            await heartbeatPending;
        }

        return true;
    }
}
