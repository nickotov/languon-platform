import {
    DictionaryLanguageTagSchema,
    SentencePreparationStartRequestSchema,
    SentencePreparationCommandRequestSchema,
    type SentencePreparationStartRequest,
    type SentencePreparationCommandRequest,
} from '@languon/contracts';
import type {
    Configuration,
    SentenceApi,
    SentencePreparationController,
} from '../types';
import { isAccessLoss, isUncertain, toApiError } from '../lib/api-error';

type State = Pick<
    SentencePreparationController,
    | 'preparation'
    | 'batches'
    | 'busy'
    | 'error'
    | 'uncertain'
    | 'nextOffset'
    | 'eligibleCount'
    | 'explanationLanguage'
>;
type Stored = {
    explanationLanguage?: NonNullable<Configuration['explanationLanguage']>;
    id?: string;
    start?: SentencePreparationStartRequest;
    command?: SentencePreparationCommandRequest;
};
function parseStored(value: unknown): Stored {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const input = value as Record<string, unknown>;
    const id =
        typeof input.id === 'string' &&
        /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(input.id)
            ? input.id
            : undefined;
    const start = SentencePreparationStartRequestSchema.safeParse(input.start);
    const explanation = DictionaryLanguageTagSchema.safeParse(
        input.explanationLanguage,
    );
    const command = SentencePreparationCommandRequestSchema.safeParse(
        input.command,
    );
    return {
        ...(explanation.success
            ? { explanationLanguage: explanation.data }
            : {}),
        ...(id ? { id } : {}),
        ...(start.success ? { start: start.data } : {}),
        ...(id && command.success ? { command: command.data } : {}),
    };
}
const empty: State = {
    preparation: null,
    batches: [],
    busy: false,
    error: null,
    uncertain: false,
    nextOffset: null,
    eligibleCount: null,
    explanationLanguage: undefined,
};

/** Durable recovery retains operation IDs so uncertain admission cannot duplicate paid work. */
export class SentencePreparationStore {
    private state: State = empty;
    private listeners = new Set<() => void>();
    private enabled = false;
    private epoch = 0;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private stored: Stored = {};
    private requestInFlight = false;
    private countLoading = false;
    private readonly storageKey: string;

    constructor(
        private readonly api: SentenceApi,
        identity: string,
    ) {
        this.storageKey = `languon:sentence-preparation:v1:${identity}`;
    }
    subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };
    getSnapshot = () => this.state;
    private update(patch: Partial<State>) {
        this.state = { ...this.state, ...patch };
        for (const listener of this.listeners) listener();
    }
    private save(record: Stored) {
        this.stored = record;
        try {
            localStorage.setItem(this.storageKey, JSON.stringify(record));
        } catch {
            /* In-memory recovery still works when storage is unavailable. */
        }
    }
    enable = () => {
        this.enabled = true;
        try {
            this.stored = parseStored(
                JSON.parse(localStorage.getItem(this.storageKey) ?? '{}'),
            );
        } catch {
            this.stored = {};
        }
        void this.refresh();
    };
    disable = () => {
        this.enabled = false;
        this.epoch++;
        this.requestInFlight = false;
        if (this.timer) clearTimeout(this.timer);
        this.update(empty);
    };
    clear = () => {
        this.epoch++;
        this.requestInFlight = false;
        if (this.timer) clearTimeout(this.timer);
        this.save({});
        this.update(empty);
    };
    private schedule() {
        if (this.timer) clearTimeout(this.timer);
        const state = this.state.preparation?.state;
        const working =
            state === 'queued' || state === 'running' || state === 'stopping';
        if (this.enabled && working)
            this.timer = setTimeout(() => void this.refresh(), 2500);
    }
    private async execute(operation: () => Promise<void>) {
        if (!this.enabled || this.requestInFlight) return;
        this.requestInFlight = true;
        const epoch = this.epoch;
        this.update({ busy: true, error: null });
        try {
            await operation();
        } catch (error) {
            if (epoch !== this.epoch || !this.enabled) return;
            const converted = toApiError(error);
            if (isAccessLoss(converted)) {
                this.save({});
                this.update({ ...empty, error: converted });
            } else {
                const uncertain = isUncertain(converted);
                if (!uncertain)
                    this.save(
                        this.stored.id
                            ? {
                                  id: this.stored.id,
                                  ...(this.stored.explanationLanguage
                                      ? {
                                            explanationLanguage:
                                                this.stored.explanationLanguage,
                                        }
                                      : {}),
                              }
                            : {},
                    );
                this.update({ error: converted, uncertain });
            }
        } finally {
            if (epoch === this.epoch && this.enabled) {
                this.requestInFlight = false;
                this.update({ busy: false });
                this.schedule();
            }
        }
    }
    private async recover() {
        const epoch = this.epoch;
        const { id, start, command } = this.stored;
        let response;
        if (start && this.api.startPreparation)
            response = await this.api.startPreparation(start);
        else if (id && command && this.api.commandPreparation)
            response = await this.api.commandPreparation(id, command);
        else if (id && this.api.getPreparation)
            response = await this.api.getPreparation(id);
        if (!response || !this.enabled || epoch !== this.epoch) return;
        const preparation = response.preparation;
        const explanationLanguage =
            this.stored.explanationLanguage ?? start?.explanationLanguage;
        this.save({
            id: preparation.id,
            ...(explanationLanguage ? { explanationLanguage } : {}),
        });
        this.update({ explanationLanguage });
        const invalid =
            preparation.pauseReason === 'stale' ||
            preparation.pauseReason === 'access';
        this.update({
            preparation,
            uncertain: false,
            ...(invalid ? { batches: [], nextOffset: null } : {}),
        });
        if (invalid || !this.api.preparationBatches) return;
        const desired = Math.max(25, this.state.batches.length);
        const batches: State['batches'] = [];
        let offset: number | null = 0;
        do {
            const page = await this.api.preparationBatches(preparation.id, {
                offset,
                limit: 25,
            });
            if (!this.enabled || epoch !== this.epoch) return;
            batches.push(...page.items);
            offset = page.nextOffset;
        } while (offset !== null && batches.length < desired);
        this.update({ batches, nextOffset: offset });
    }
    loadEligibleCount = async () => {
        if (
            !this.enabled ||
            this.countLoading ||
            this.state.eligibleCount !== null
        )
            return;
        this.countLoading = true;
        const epoch = this.epoch;
        let cursor: string | null = null;
        let count = 0;
        const cursors = new Set<string>();
        try {
            do {
                const page = await this.api.listEntries({
                    limit: 25,
                    ...(cursor ? { cursor } : {}),
                });
                if (!this.enabled || epoch !== this.epoch) return;
                count += page.entries.filter(
                    (entry) => entry.source.trim() && entry.translation.trim(),
                ).length;
                cursor = page.nextCursor;
                if (cursor && cursors.has(cursor)) return;
                if (cursor) cursors.add(cursor);
            } while (cursor && count < 10_000);
            this.update({ eligibleCount: count });
        } catch {
            /* Starting preparation remains available; its response has authoritative coverage. */
        } finally {
            this.countLoading = false;
        }
    };
    refresh = async () => {
        await this.execute(() => this.recover());
    };
    start = async (configuration: Configuration) => {
        if (this.state.uncertain || this.stored.start || this.stored.command) {
            await this.refresh();
            return;
        }
        const existing = this.state.preparation;
        if (
            existing &&
            !['completed', 'failed'].includes(existing.state) &&
            existing.pauseReason !== 'stale' &&
            existing.pauseReason !== 'access'
        ) {
            await this.refresh();
            return;
        }
        if (!this.api.startPreparation || this.requestInFlight) return;
        const input = SentencePreparationStartRequestSchema.parse({
            operationId: crypto.randomUUID(),
            direction: configuration.direction,
            mode: configuration.mode,
            initialRoundScope: configuration.scope,
            explanationLanguage: configuration.explanationLanguage,
        });
        this.save({
            start: input,
            ...(input.explanationLanguage
                ? { explanationLanguage: input.explanationLanguage }
                : {}),
        });
        await this.execute(() => this.recover());
    };
    private async command(action: 'stop' | 'resume' | 'continue') {
        if (
            !this.stored.id ||
            !this.api.commandPreparation ||
            this.requestInFlight
        )
            return;
        if (this.state.uncertain || this.stored.command) {
            await this.refresh();
            return;
        }
        this.save({
            id: this.stored.id,
            ...(this.stored.explanationLanguage
                ? { explanationLanguage: this.stored.explanationLanguage }
                : {}),
            command: { action, operationId: crypto.randomUUID() },
        });
        await this.execute(() => this.recover());
    }
    stop = async () => {
        await this.command('stop');
    };
    resume = async () => {
        await this.command('resume');
    };
    continueWithBudget = async () => {
        await this.command('continue');
    };
    loadMore = async () => {
        const id = this.stored.id;
        const offset = this.state.nextOffset;
        if (!id || offset === null || !this.api.preparationBatches) return;
        const epoch = this.epoch;
        await this.execute(async () => {
            const page = await this.api.preparationBatches!(id, {
                offset,
                limit: 25,
            });
            if (!this.enabled || epoch !== this.epoch) return;
            this.update({
                batches: [...this.state.batches, ...page.items],
                nextOffset: page.nextOffset,
            });
        });
    };
}
