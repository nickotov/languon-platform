import { shuffled } from '../lib/flashcard-fields';
import type { Rating } from '../types';
import { SessionReader } from './session-reader';
import { SessionWriter } from './session-writer';
import { EMPTY_STATS, initialSession } from './session-state';
import type { SessionHost, SessionInput, SessionState } from './session-state';

/** Feature-local session state; no browser persistence, automatic queue resume or requeue. */
export class PracticeSession implements SessionHost {
    private state: SessionState;
    private listeners = new Set<() => void>();
    private generation = 0;
    private active = false;
    private reader: SessionReader;
    private writer: SessionWriter;
    public constructor(public readonly input: SessionInput) {
        this.state = initialSession(input);
        this.reader = new SessionReader(this);
        this.writer = new SessionWriter(this);
    }
    public getState = (): SessionState => this.state;
    public subscribe = (listener: () => void): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };
    public currentGeneration = (): number => this.generation;
    public isCurrent = (generation: number): boolean =>
        this.active && generation === this.generation;
    public patch(change: Partial<SessionState>): void {
        if (!this.active) return;
        this.state = { ...this.state, ...change };
        for (const listener of this.listeners) listener();
    }
    public start(): void {
        this.generation += 1;
        this.active = true;
        this.reader = new SessionReader(this);
        this.writer = new SessionWriter(this);
        this.patch(initialSession(this.input));
        void this.load();
        void this.refreshProgress();
    }
    public dispose(): void {
        this.generation += 1;
        this.unavailable();
        this.active = false;
    }
    public unavailable = (): void => {
        this.generation += 1;
        this.patch({
            phase: 'unavailable',
            items: {},
            allIds: [],
            queue: [],
            outcomes: {},
            pending: null,
            lastAck: null,
            conflict: null,
            conflictBusy: false,
            progress: null,
            progressStatus: 'idle',
            itemsLoading: false,
            error: null,
            notices: [],
            announcement: 'accessLost',
        });
    };
    public load = (): Promise<void> => this.reader.load();
    public refreshProgress = (): Promise<void> => this.reader.refreshProgress();
    public resolveContentConflict = (): Promise<void> =>
        this.reader.reloadCurrent();
    public rate = (rating: Rating, beforeAdvance?: Promise<void>): void =>
        this.writer.rate(rating, beforeAdvance);
    public undo = (): void => this.writer.undo();
    public retry = (): void => this.writer.retry();
    public flip = (): void => {
        const state = this.state;
        // An ambiguous failed save also freezes face/content until the same operation resolves.
        if (
            state.phase !== 'card' ||
            state.pending ||
            state.conflict ||
            !state.items[state.queue[state.index]!]
        )
            return;
        this.patch({
            face: state.face === 'front' ? 'back' : 'front',
            announcement:
                state.face === 'front' ? 'showingBack' : 'showingFront',
        });
    };
    public dismissConflict = (): void => {
        if (this.state.conflict === 'content' || this.state.conflictBusy)
            return;
        this.patch({ conflict: null });
        void this.refreshProgress();
    };
    private startRound(ids: string[]): void {
        if (
            this.state.phase !== 'results' ||
            this.state.pending ||
            this.state.conflict
        )
            return;
        this.patch({
            round: this.state.round + 1,
            queue: this.input.shuffle ? shuffled(ids) : [...ids],
            index: 0,
            face: 'front',
            roundStats: { ...EMPTY_STATS },
            items: {},
            lastAck: null,
            pending: null,
            conflict: null,
            phase: ids.length ? 'loading' : 'results',
            announcement: 'roundStarted',
        });
        void this.load();
        void this.refreshProgress();
    }
    public practiseAgain = (): void =>
        this.startRound(
            this.state.allIds.filter(
                (id) => this.state.outcomes[id] === 'again',
            ),
        );
    public startOver = (): void => this.startRound(this.state.allIds);
    public retryLoad = (): void => {
        if (
            this.state.phase !== 'error' ||
            (this.state.errorRetryAt && this.state.errorRetryAt > Date.now())
        )
            return;
        this.patch({ phase: 'loading', error: null, errorRetryAt: undefined });
        void this.load();
    };
    public dismissNotice = (index: number): void => {
        this.patch({
            notices: this.state.notices.filter(
                (_, position) => position !== index,
            ),
        });
    };
}
