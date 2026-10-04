import type { SentenceDirection } from '@languon/contracts';
import type { SentenceApi, SentenceHistoryController } from '../types';
import { isAccessLoss, toApiError } from '../lib/api-error';
type State = Omit<
    SentenceHistoryController,
    'loadMoreAttempts' | 'loadMoreReviews' | 'refresh' | 'invalidate'
>;
export class SentenceHistory {
    private state: State = {
        attempts: [],
        reviews: [],
        loading: false,
        error: null,
        hasMoreAttempts: false,
        hasMoreReviews: false,
    };
    private listeners = new Set<() => void>();
    private epoch = 0;
    private enabled = false;
    private attemptsCursor: string | null = null;
    private reviewsCursor: string | null = null;
    private pending = false;
    public constructor(
        private readonly api: SentenceApi,
        private readonly direction?: SentenceDirection,
        private readonly exerciseId?: string,
    ) {}
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
        this.epoch++;
        this.pending = false;
    };
    public invalidate = () => {
        this.stop();
        this.attemptsCursor = null;
        this.reviewsCursor = null;
        this.update({
            attempts: [],
            reviews: [],
            loading: false,
            error: null,
            hasMoreAttempts: false,
            hasMoreReviews: false,
        });
    };
    private query() {
        return {
            limit: 25,
            ...(this.direction ? { direction: this.direction } : {}),
            ...(this.exerciseId ? { exerciseId: this.exerciseId } : {}),
        };
    }
    private async load(kind: 'all' | 'attempts' | 'reviews') {
        if (!this.enabled || this.pending) return;
        this.pending = true;
        const epoch = this.epoch;
        this.update({ loading: true, error: null });
        try {
            const [attempts, reviews] = await Promise.all([
                kind === 'reviews'
                    ? null
                    : this.api.attempts({
                          ...this.query(),
                          ...(kind === 'attempts' && this.attemptsCursor
                              ? { cursor: this.attemptsCursor }
                              : {}),
                      }),
                kind === 'attempts'
                    ? null
                    : this.api.manualReviews({
                          ...this.query(),
                          ...(kind === 'reviews' && this.reviewsCursor
                              ? { cursor: this.reviewsCursor }
                              : {}),
                      }),
            ]);
            if (!this.enabled || epoch !== this.epoch) return;
            const patch: Partial<State> = { loading: false };
            if (attempts) {
                this.attemptsCursor = attempts.nextCursor;
                patch.hasMoreAttempts = attempts.nextCursor !== null;
                patch.attempts =
                    kind === 'all'
                        ? attempts.attempts
                        : [
                              ...new Map(
                                  [
                                      ...this.state.attempts,
                                      ...attempts.attempts,
                                  ].map((a) => [a.id, a]),
                              ).values(),
                          ];
            }
            if (reviews) {
                this.reviewsCursor = reviews.nextCursor;
                patch.hasMoreReviews = reviews.nextCursor !== null;
                patch.reviews =
                    kind === 'all'
                        ? reviews.reviews
                        : [
                              ...new Map(
                                  [
                                      ...this.state.reviews,
                                      ...reviews.reviews,
                                  ].map((a) => [a.id, a]),
                              ).values(),
                          ];
            }
            this.update(patch);
        } catch (error) {
            if (!this.enabled || epoch !== this.epoch) return;
            const converted = toApiError(error);
            this.update({
                loading: false,
                error: converted,
                ...(isAccessLoss(converted)
                    ? {
                          attempts: [],
                          reviews: [],
                          hasMoreAttempts: false,
                          hasMoreReviews: false,
                      }
                    : {}),
            });
        } finally {
            if (epoch === this.epoch) this.pending = false;
        }
    }
    public refresh = () => {
        this.epoch++;
        this.pending = false;
        this.attemptsCursor = null;
        this.reviewsCursor = null;
        void this.load('all');
    };
    public loadMoreAttempts = async () => {
        if (this.attemptsCursor) await this.load('attempts');
    };
    public loadMoreReviews = async () => {
        if (this.reviewsCursor) await this.load('reviews');
    };
}
