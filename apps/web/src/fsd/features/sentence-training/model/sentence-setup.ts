import type {
    Configuration,
    SentenceApi,
    SentenceSetupController,
} from '../types';
import {
    SentencePrepareRequestSchema,
    SENTENCE_LIMITS,
} from '@languon/contracts';
import { isAccessLoss, toApiError } from '../lib/api-error';
type State = Omit<
    SentenceSetupController,
    | 'setConfiguration'
    | 'setSearch'
    | 'setSelectedEntryIds'
    | 'loadMore'
    | 'refresh'
    | 'invalidate'
>;
export class SentenceSetup {
    private state: State;
    private listeners = new Set<() => void>();
    private prepareVersion = 0;
    private entriesVersion = 0;
    private enabled = false;
    private cursor: string | null = null;
    private entryRequest = false;
    private timer: ReturnType<typeof setTimeout> | null = null;
    public constructor(
        private readonly api: SentenceApi,
        initialExplanationLanguage?: Configuration['explanationLanguage'],
    ) {
        this.state = {
            configuration: {
                direction: 'source-to-target',
                mode: 'saved-first',
                scope: { type: 'all' },
                ...(initialExplanationLanguage
                    ? { explanationLanguage: initialExplanationLanguage }
                    : {}),
            },
            entries: [],
            search: '',
            selectedEntryIds: [],
            prepared: null,
            loading: false,
            entriesLoading: false,
            error: null,
            entriesError: null,
            hasMore: false,
        };
    }
    public subscribe = (listener: () => void) => {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    };
    public getSnapshot = () => this.state;
    private update(patch: Partial<State>) {
        this.state = { ...this.state, ...patch };
        for (const listener of this.listeners) listener();
    }
    public enable = () => {
        this.enabled = true;
        this.refresh();
    };
    public stop = () => {
        this.enabled = false;
        this.prepareVersion++;
        this.entriesVersion++;
        this.entryRequest = false;
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
    };
    public invalidate = () => {
        this.stop();
        this.cursor = null;
        this.update({
            configuration: {
                ...this.state.configuration,
                scope: { type: 'all' },
            },
            entries: [],
            search: '',
            selectedEntryIds: [],
            prepared: null,
            loading: false,
            entriesLoading: false,
            error: null,
            entriesError: null,
            hasMore: false,
        });
    };
    public setConfiguration = (configuration: Configuration) => {
        this.update({
            configuration,
            selectedEntryIds:
                configuration.scope.type === 'manual'
                    ? configuration.scope.entryIds
                    : this.state.selectedEntryIds,
            prepared: null,
            error: null,
        });
        if (this.enabled) void this.prepare();
    };
    public setSelectedEntryIds = (selectedEntryIds: string[]) => {
        const distinct = [...new Set(selectedEntryIds)].slice(
            0,
            SENTENCE_LIMITS.selectedEntries,
        );
        this.update({ selectedEntryIds: distinct });
        if (this.state.configuration.scope.type === 'manual')
            this.setConfiguration({
                ...this.state.configuration,
                scope: { type: 'manual', entryIds: distinct },
            });
    };
    public setSearch = (search: string) => {
        this.entriesVersion++;
        this.entryRequest = false;
        this.cursor = null;
        this.update({
            search,
            entries: [],
            hasMore: false,
            entriesError: null,
        });
        if (this.timer) clearTimeout(this.timer);
        if (this.enabled)
            this.timer = setTimeout(() => {
                this.timer = null;
                void this.entries(true);
            }, 250);
    };
    private async prepare() {
        const version = ++this.prepareVersion;
        const parsed = SentencePrepareRequestSchema.safeParse(
            this.state.configuration,
        );
        if (!parsed.success) {
            this.update({ loading: false, prepared: null });
            return;
        }
        this.update({ loading: true, error: null, prepared: null });
        try {
            const prepared = await this.api.prepare(parsed.data);
            if (!this.enabled || version !== this.prepareVersion) return;
            this.update({
                prepared,
                loading: false,
                configuration: {
                    ...this.state.configuration,
                    explanationLanguage: prepared.explanationLanguage,
                },
            });
        } catch (error) {
            if (!this.enabled || version !== this.prepareVersion) return;
            const converted = toApiError(error);
            this.update({
                loading: false,
                prepared: null,
                error: converted,
                ...(isAccessLoss(converted)
                    ? { entries: [], selectedEntryIds: [], hasMore: false }
                    : {}),
            });
        }
    }
    private async entries(reset: boolean) {
        if (!this.enabled || this.entryRequest) return;
        const version = reset ? ++this.entriesVersion : this.entriesVersion;
        this.entryRequest = true;
        this.update({ entriesLoading: true, entriesError: null });
        try {
            const page = await this.api.listEntries({
                limit: 25,
                ...(this.state.search.trim()
                    ? { search: this.state.search.trim() }
                    : {}),
                ...(!reset && this.cursor ? { cursor: this.cursor } : {}),
            });
            if (!this.enabled || version !== this.entriesVersion) return;
            this.cursor = page.nextCursor;
            const entries = reset
                ? page.entries
                : [...this.state.entries, ...page.entries];
            this.update({
                entries: [
                    ...new Map(
                        entries.map((entry) => [entry.entryId, entry]),
                    ).values(),
                ],
                entriesLoading: false,
                hasMore: page.nextCursor !== null,
            });
        } catch (error) {
            if (!this.enabled || version !== this.entriesVersion) return;
            const converted = toApiError(error);
            this.update({
                entriesLoading: false,
                entriesError: converted,
                ...(isAccessLoss(converted)
                    ? {
                          entries: [],
                          prepared: null,
                          selectedEntryIds: [],
                          hasMore: false,
                      }
                    : {}),
            });
        } finally {
            if (version === this.entriesVersion) this.entryRequest = false;
        }
    }
    public loadMore = async () => {
        if (this.cursor) await this.entries(false);
    };
    public refresh = () => {
        if (!this.enabled) return;
        void this.prepare();
        void this.entries(true);
    };
}
