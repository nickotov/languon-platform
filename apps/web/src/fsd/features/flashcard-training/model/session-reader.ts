import { isAccessLoss, retryAtFor, toApiError } from '../lib/api-error';
import { removeEntries } from '../lib/session-transitions';
import type { SessionHost } from './session-state';

export class SessionReader {
    private progressSequence = 0;
    private loading = false;
    public constructor(private readonly host: SessionHost) {}

    public async load(): Promise<void> {
        const host = this.host;
        const state = host.getState();
        if (this.loading || !['card', 'loading'].includes(state.phase)) return;
        if (state.index >= state.queue.length) {
            host.patch({
                phase: 'results',
                roundsCompleted: state.roundsCompleted + 1,
            });
            return;
        }
        const needed = state.queue
            .slice(state.index, state.index + 25)
            .filter((id) => !state.items[id]);
        if (!needed.length) {
            host.patch({ phase: 'card' });
            return;
        }
        const generation = host.currentGeneration();
        this.loading = true;
        host.patch({ itemsLoading: true, error: null });
        try {
            const response = await host.input.api.getItems({
                configuration: host.input.configuration,
                entryIds: needed,
            });
            if (!host.isCurrent(generation)) return;
            const current = host.getState();
            const received = new Map(
                response.items.map((item) => [item.entryId, item]),
            );
            // Treat omitted IDs as unavailable too; never spin forever on a partial reply.
            const removed = needed.filter((id) => !received.has(id));
            const change = removed.length
                ? removeEntries(current, removed)
                : {};
            const items = { ...(change.items ?? current.items) };
            for (const item of response.items)
                if (needed.includes(item.entryId)) items[item.entryId] = item;
            host.patch({
                ...change,
                items,
                itemsLoading: false,
                phase: change.phase === 'results' ? 'results' : 'card',
            });
        } catch (cause) {
            if (!host.isCurrent(generation)) return;
            const error = toApiError(cause);
            if (isAccessLoss(error)) host.unavailable();
            else
                host.patch({
                    phase: 'error',
                    itemsLoading: false,
                    error,
                    errorRetryAt: retryAtFor(error),
                    announcement: 'loadFailed',
                });
        } finally {
            this.loading = false;
            if (host.isCurrent(generation)) {
                const current = host.getState();
                if (
                    current.phase === 'card' &&
                    !current.items[current.queue[current.index]!]
                )
                    void host.load();
            }
        }
    }

    public async refreshProgress(): Promise<void> {
        const host = this.host;
        if (!host.input.signedIn || host.getState().phase === 'unavailable')
            return;
        const generation = host.currentGeneration();
        const sequence = ++this.progressSequence;
        host.patch({ progressStatus: 'loading' });
        try {
            const progress = await host.input.api.getProgress();
            if (
                host.isCurrent(generation) &&
                sequence === this.progressSequence
            )
                host.patch({ progress, progressStatus: 'idle' });
        } catch (cause) {
            if (
                !host.isCurrent(generation) ||
                sequence !== this.progressSequence
            )
                return;
            const error = toApiError(cause);
            if (isAccessLoss(error)) host.unavailable();
            else host.patch({ progressStatus: 'error' });
        }
    }

    public async reloadCurrent(): Promise<void> {
        const host = this.host;
        const entryId = host.getState().queue[host.getState().index];
        if (!entryId || host.getState().conflictBusy) return;
        const generation = host.currentGeneration();
        host.patch({ conflictBusy: true });
        try {
            const result = await host.input.api.getItems({
                configuration: host.input.configuration,
                entryIds: [entryId],
            });
            if (!host.isCurrent(generation)) return;
            const item = result.items.find(
                (candidate) => candidate.entryId === entryId,
            );
            if (!item)
                host.patch({
                    ...removeEntries(host.getState(), [entryId]),
                    conflictBusy: false,
                });
            else
                host.patch({
                    items: { ...host.getState().items, [entryId]: item },
                    face: 'front',
                    conflict: null,
                    conflictBusy: false,
                    announcement: 'updatedCardLoaded',
                });
            void host.load();
            void host.refreshProgress();
        } catch (cause) {
            if (!host.isCurrent(generation)) return;
            const error = toApiError(cause);
            if (isAccessLoss(error)) host.unavailable();
            else
                host.patch({
                    conflictBusy: false,
                    notices: [...host.getState().notices, 'updatedCardFailed'],
                });
        }
    }
}
