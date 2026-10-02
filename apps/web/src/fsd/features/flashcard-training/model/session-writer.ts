import type { FlashcardAttemptRequest } from '@languon/contracts';
import { isAccessLoss, retryAtFor, toApiError } from '../lib/api-error';
import {
    acknowledgeRating,
    removeEntries,
    restoreRating,
} from '../lib/session-transitions';
import type { Rating } from '../types';
import type { AckedRating, Pending, SessionHost } from './session-state';

type Operation =
    | { pending: Pending; payload: FlashcardAttemptRequest }
    | { pending: Pending; acknowledged: AckedRating };

/** Retains the exact payload until ACK; ambiguous retries cannot create a new rating. */
export class SessionWriter {
    private busy = false;
    private operation: Operation | null = null;
    public constructor(private readonly host: SessionHost) {}

    public rate(rating: Rating): void {
        const host = this.host;
        const state = host.getState();
        const entryId = state.queue[state.index];
        const item = entryId ? state.items[entryId] : undefined;
        if (
            state.phase !== 'card' ||
            state.pending ||
            state.conflict ||
            this.busy ||
            !item
        )
            return;
        if (!host.input.signedIn) {
            host.patch(acknowledgeRating(state, rating, null));
            void host.load();
            return;
        }
        const pending: Pending = {
            kind: 'rate',
            rating,
            entryId: item.entryId,
            operationId: crypto.randomUUID(),
            status: 'saving',
        };
        this.operation = {
            pending,
            payload: {
                operationId: pending.operationId,
                sessionId: host.input.sessionId,
                entryId: item.entryId,
                expectedLearningVersion: item.learningVersion,
                round: state.round,
                rating,
                configuration: host.input.configuration,
            },
        };
        void this.submit(this.operation);
    }

    public undo(): void {
        const state = this.host.getState();
        const acknowledged = state.lastAck;
        if (!acknowledged || state.pending || state.conflict || this.busy)
            return;
        if (!acknowledged.attemptId) {
            this.host.patch(restoreRating(state, acknowledged));
            return;
        }
        const pending: Pending = {
            kind: 'undo',
            entryId: acknowledged.entryId,
            rating: acknowledged.rating,
            operationId: crypto.randomUUID(),
            status: 'saving',
        };
        this.operation = { pending, acknowledged };
        void this.submit(this.operation);
    }

    public retry(): void {
        const pending = this.host.getState().pending;
        if (
            !this.operation ||
            !pending ||
            pending.status !== 'error' ||
            this.busy
        )
            return;
        if (pending.retryAt && pending.retryAt > Date.now()) return;
        void this.submit(this.operation);
    }

    private async submit(operation: Operation): Promise<void> {
        const host = this.host;
        const generation = host.currentGeneration();
        this.busy = true;
        host.patch({
            pending: { ...operation.pending, status: 'saving' },
            announcement: 'savingRating',
        });
        try {
            if ('payload' in operation) {
                const response = await host.input.api.rate(operation.payload);
                if (!host.isCurrent(generation)) return;
                // A valid but unrelated response must never advance this card.
                if (
                    response.entryId !== operation.payload.entryId ||
                    response.rating !== operation.payload.rating ||
                    response.learningVersion !==
                        operation.payload.expectedLearningVersion
                )
                    throw new Error('Mismatched rating acknowledgment');
                host.patch(
                    acknowledgeRating(
                        host.getState(),
                        operation.pending.rating,
                        response.attemptId,
                    ),
                );
            } else {
                const response = await host.input.api.undo(
                    operation.acknowledged.attemptId!,
                    operation.pending.operationId,
                );
                if (!host.isCurrent(generation)) return;
                const item =
                    host.getState().items[operation.acknowledged.entryId];
                if (
                    response.attemptId !== operation.acknowledged.attemptId ||
                    response.entryId !== operation.acknowledged.entryId ||
                    response.learningVersion !== item?.learningVersion
                )
                    throw new Error('Mismatched undo acknowledgment');
                host.patch(
                    restoreRating(host.getState(), operation.acknowledged),
                );
            }
            this.operation = null;
            void host.load();
            void host.refreshProgress();
        } catch (cause) {
            if (!host.isCurrent(generation)) return;
            const error = toApiError(cause);
            const isUndo = operation.pending.kind === 'undo';
            if (isAccessLoss(error)) host.unavailable();
            else if (error.code === 'entry_not_found') {
                host.patch(
                    removeEntries(host.getState(), [operation.pending.entryId]),
                );
                void host.load();
                void host.refreshProgress();
            } else if (
                isUndo &&
                (error.code === 'undo_conflict' ||
                    error.code === 'learning_version_conflict' ||
                    error.code === 'idempotency_conflict')
            ) {
                host.patch({
                    pending: null,
                    lastAck: null,
                    conflict: 'undo',
                    announcement: 'undoUnavailable',
                });
                void host.refreshProgress();
            } else if (error.code === 'learning_version_conflict') {
                // A rejected later rating is not an ACK. The prior confirmed
                // attempt remains undoable; the backend still guards its epoch/latest status.
                host.patch({
                    pending: null,
                    conflict: 'content',
                    announcement: 'cardChanged',
                });
            } else if (error.code === 'idempotency_conflict') {
                host.patch({
                    pending: null,
                    conflict: 'operation',
                    announcement: 'operationConflict',
                });
                void host.refreshProgress();
            } else {
                host.patch({
                    pending: {
                        ...operation.pending,
                        status: 'error',
                        error,
                        retryAt: retryAtFor(error),
                    },
                    announcement: 'saveUnconfirmed',
                });
            }
        } finally {
            this.busy = false;
        }
    }
}
