import type {
    ClaimedConversationTurn,
    ConversationStore,
} from './ports/conversation-store';
import type { TutorRunner } from './ports/tutor-runner';
import { ConversationError } from '../domain/conversation';
import { projectConversationSource } from './conversation-source-context';

export type ConversationWorkerStore = Pick<
    ConversationStore,
    | 'claim'
    | 'heartbeat'
    | 'append'
    | 'recordTool'
    | 'propose'
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
        if (!turn) return false;
        const controller = new AbortController();
        const combined = AbortSignal.any([
            signal,
            controller.signal,
            AbortSignal.timeout(this.dependencies.timeoutMs ?? 240_000),
        ]);
        let heartbeatPending: Promise<void> | undefined;
        const timer = setInterval(() => {
            if (heartbeatPending) return;
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
                ownerId: turn.ownerId,
                operationId: turn.id,
                conversationCreatedAt: turn.conversationCreatedAt,
                message: turn.message,
                preferences: turn.preferences,
                sourceContext: source.initialContext,
                memory: this.dependencies.store.memory(turn),
                signal: combined,
                onDelta: async ({ text }) => {
                    combined.throwIfAborted();
                    await this.dependencies.store.append(turn, text);
                },
                onTool: async (call) =>
                    this.dependencies.store.recordTool(turn, call),
                onDraft: async (content) =>
                    this.dependencies.store.propose(
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
                    ),
                readContext: async ({ query, limit }) => {
                    combined.throwIfAborted();
                    await this.dependencies.store.heartbeat(turn);
                    const selected = source.read({ query, limit });
                    await this.dependencies.store.recordMaterial(
                        turn,
                        selected.material,
                    );
                    return selected;
                },
            });
            combined.throwIfAborted();
            await this.dependencies.store.finish(turn, 'succeeded');
        } catch (error) {
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
                if (!(finishError instanceof ConversationError))
                    throw finishError; /* Expired/lost source is finalized by lease recovery without exposing content. */
            }
        } finally {
            clearInterval(timer);
            await heartbeatPending;
        }
        return true;
    }
}
