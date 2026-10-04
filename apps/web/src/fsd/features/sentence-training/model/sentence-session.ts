import type {
    SentenceCheckRequest,
    SentenceJob,
    SentenceNextRequest,
    SentenceReferenceRevealRequest,
    SentenceMode,
} from '@languon/contracts';
import {
    SentenceCheckRequestSchema,
    SentencePrepareRequestSchema,
    SENTENCE_LIMITS,
} from '@languon/contracts';
import type {
    Configuration,
    SentenceApi,
    SentenceSessionController,
} from '../types';
import {
    ApiError,
    isAccessLoss,
    isUncertain,
    toApiError,
} from '../lib/api-error';

type State = Omit<
    SentenceSessionController,
    | 'start'
    | 'changeMode'
    | 'restartReview'
    | 'next'
    | 'check'
    | 'revealReference'
    | 'retry'
    | 'cancel'
    | 'setDraft'
    | 'toggleHint'
    | 'reset'
    | 'retryProgress'
>;
type Pending =
    | { kind: 'next'; payload: SentenceNextRequest }
    | { kind: 'check'; exerciseId: string; payload: SentenceCheckRequest };
const activeJob = (job: SentenceJob | null) =>
    job?.state === 'queued' || job?.state === 'running';
export const initialSentenceState = (): State => ({
    phase: 'idle',
    configuration: null,
    sessionId: null,
    exercise: null,
    draft: '',
    submittedAnswer: null,
    acknowledgedAnswer: null,
    revealedHintIds: [],
    job: null,
    attempt: null,
    reference: null,
    referenceLoading: false,
    error: null,
    referenceError: null,
    progress: null,
    progressLoading: false,
    progressError: null,
    counts: {
        presented: 0,
        checked: 0,
        assisted: 0,
        manuallyReviewed: 0,
        ratings: { perfect: 0, good: 0, notBad: 0, practiseAgainLater: 0 },
    },
    busy: false,
    uncertain: false,
    canRetry: false,
    emptyReason: null,
    visitedExerciseIds: [],
});

/** Owns one in-memory session. API admission/polling is serialized independently of React renders. */
export class SentenceSession {
    private state = initialSentenceState();
    private listeners = new Set<() => void>();
    private epoch = 0;
    private progressVersion = 0;
    private pollVersion = 0;
    private pending: Pending | null = null;
    private referencePayload: {
        exerciseId: string;
        payload: SentenceReferenceRevealRequest;
    } | null = null;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private polling = false;
    private admitted = false;
    private revealing = false;
    private cancelling = false;
    private attempts = new Set<string>();
    private reviews = new Set<string>();
    public constructor(
        private readonly api: SentenceApi,
        private readonly pollMilliseconds = 1500,
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
    private clearTimer() {
        if (this.timer !== null) clearTimeout(this.timer);
        this.timer = null;
    }
    public reset = () => {
        this.epoch++;
        this.progressVersion++;
        this.pollVersion++;
        this.clearTimer();
        this.pending = null;
        this.referencePayload = null;
        this.admitted = this.polling = this.revealing = this.cancelling = false;
        this.attempts.clear();
        this.reviews.clear();
        this.state = initialSentenceState();
        for (const listener of this.listeners) listener();
    };
    public stop = () => {
        this.reset();
    };
    private async refreshProgress(epoch: number) {
        const version = ++this.progressVersion;
        const direction = this.state.configuration?.direction;
        if (!direction) return;
        this.update({ progressLoading: true, progressError: null });
        try {
            const progress = await this.api.progress(direction);
            if (epoch === this.epoch && version === this.progressVersion)
                this.update({
                    progress,
                    progressLoading: false,
                    progressError: null,
                });
        } catch (error) {
            if (epoch === this.epoch && version === this.progressVersion) {
                const converted = toApiError(error);
                if (isAccessLoss(converted)) this.fail(error);
                else
                    this.update({
                        progressLoading: false,
                        progressError: converted,
                    });
            }
        }
    }
    public retryProgress = async () => {
        if (this.state.progressLoading) return;
        if (
            this.state.progressError?.retryAt &&
            this.state.progressError.retryAt > Date.now()
        )
            return;
        await this.refreshProgress(this.epoch);
    };
    private fail(error: unknown) {
        const converted = toApiError(error);
        this.clearTimer();
        if (isAccessLoss(converted)) {
            this.reset();
            this.update({ phase: 'error', error: converted });
            return;
        }
        const stale = converted.code === 'stale_content';
        this.update({
            phase: this.state.exercise && !stale ? 'exercise' : 'error',
            error: converted,
            busy: false,
            uncertain: isUncertain(converted),
            canRetry: !stale && this.pending !== null,
            ...(stale
                ? {
                      exercise: null,
                      attempt: null,
                      reference: null,
                      submittedAnswer: null,
                      acknowledgedAnswer: null,
                      revealedHintIds: [],
                  }
                : {}),
        });
    }
    private acceptJob(job: SentenceJob, epoch: number) {
        if (epoch !== this.epoch) return;
        const previous = this.state.job;
        if (
            previous?.id === job.id &&
            (Date.parse(previous.updatedAt) > Date.parse(job.updatedAt) ||
                (!activeJob(previous) && activeJob(job)))
        )
            return;
        this.update({ job, error: null, uncertain: false, canRetry: false });
        if (activeJob(job)) {
            this.update({ busy: true });
            this.schedulePoll(epoch, job.id);
            return;
        }
        this.clearTimer();
        if (job.state === 'completed' && job.result) {
            if (job.result.kind === 'exercise')
                this.acceptExercise(job.result.exercise, epoch);
            else {
                const attempt = job.result.attempt;
                const duplicate = this.attempts.has(attempt.id);
                this.attempts.add(attempt.id);
                const ratings = { ...this.state.counts.ratings };
                const key = {
                    perfect: 'perfect',
                    good: 'good',
                    'not-bad': 'notBad',
                    'practise-again-later': 'practiseAgainLater',
                } as const;
                if (!duplicate) ratings[key[attempt.feedback.rating]]++;
                this.update({
                    phase: 'exercise',
                    attempt,
                    acknowledgedAnswer: attempt.answer,
                    busy: false,
                    counts: {
                        ...this.state.counts,
                        checked:
                            this.state.counts.checked + (duplicate ? 0 : 1),
                        assisted:
                            this.state.counts.assisted +
                            (!duplicate && attempt.assisted ? 1 : 0),
                        ratings,
                    },
                });
                void this.refreshProgress(epoch);
            }
            this.pending = null;
        } else {
            const code =
                job.failureCode === 'access_revoked'
                    ? 'dictionary_not_found'
                    : job.failureCode === 'stale_content'
                      ? 'stale_content'
                      : job.failureCode === 'model_unavailable'
                        ? 'model_unavailable'
                        : job.failureCode === 'ai_credits_exhausted'
                          ? 'ai_credits_exhausted'
                          : job.failureCode === 'capacity_unavailable'
                            ? 'capacity_unavailable'
                            : 'service_unavailable';
            this.fail(
                new ApiError(409, {
                    code,
                    correlationId: 'sentence-job',
                    message:
                        job.state === 'cancelled'
                            ? 'The task was cancelled.'
                            : 'The task did not finish. You can retry.',
                }),
            );
            this.update({
                canRetry: code !== 'stale_content' && this.pending !== null,
                uncertain: false,
            });
        }
    }
    private acceptExercise(
        exercise: NonNullable<State['exercise']>,
        epoch: number,
    ) {
        const seen = this.state.visitedExerciseIds.includes(exercise.id);
        this.referencePayload = null;
        this.update({
            phase: 'exercise',
            exercise,
            draft: '',
            submittedAnswer: null,
            acknowledgedAnswer: null,
            revealedHintIds: [],
            attempt: null,
            reference: null,
            referenceLoading: false,
            referenceError: null,
            error: null,
            busy: false,
            uncertain: false,
            canRetry: false,
            visitedExerciseIds: seen
                ? this.state.visitedExerciseIds
                : [...this.state.visitedExerciseIds, exercise.id],
            counts: {
                ...this.state.counts,
                presented: this.state.counts.presented + (seen ? 0 : 1),
            },
        });
        void this.refreshProgress(epoch);
    }
    private schedulePoll(epoch: number, id: string) {
        this.clearTimer();
        this.timer = setTimeout(() => {
            this.timer = null;
            void this.poll(epoch, id);
        }, this.pollMilliseconds);
    }
    private async poll(epoch: number, id: string) {
        if (epoch !== this.epoch || this.polling) return;
        this.polling = true;
        const version = ++this.pollVersion;
        try {
            const job = await this.api.getJob(id);
            if (version === this.pollVersion) this.acceptJob(job, epoch);
        } catch (error) {
            if (epoch === this.epoch && version === this.pollVersion)
                this.fail(error);
        } finally {
            if (epoch === this.epoch && version === this.pollVersion)
                this.polling = false;
        }
    }
    private async admit(pending: Pending, epoch: number) {
        if (this.admitted || epoch !== this.epoch) return;
        this.admitted = true;
        this.pending = pending;
        this.update({
            busy: true,
            error: null,
            canRetry: false,
            uncertain: false,
        });
        try {
            if (pending.kind === 'check') {
                const job = await this.api.check(
                    pending.exerciseId,
                    pending.payload,
                );
                this.acceptJob(job, epoch);
            } else {
                const result = await this.api.next(pending.payload);
                if (epoch !== this.epoch) return;
                if (result.kind === 'job') this.acceptJob(result.job, epoch);
                else if (result.kind === 'exercise') {
                    this.acceptExercise(result.exercise, epoch);
                    this.pending = null;
                } else {
                    this.update({
                        phase: 'empty',
                        emptyReason: result.reason,
                        busy: false,
                        canRetry: false,
                    });
                    this.pending = null;
                }
            }
        } catch (error) {
            if (epoch === this.epoch) this.fail(error);
        } finally {
            if (epoch === this.epoch) this.admitted = false;
        }
    }
    public start = async (configuration: Configuration) => {
        if (
            this.state.busy ||
            this.admitted ||
            this.revealing ||
            this.state.uncertain
        )
            return;
        const parsed = SentencePrepareRequestSchema.safeParse(configuration);
        if (!parsed.success) {
            this.fail(
                new ApiError(400, {
                    code: 'invalid_request',
                    correlationId: 'client-configuration',
                    message:
                        'Select a valid direction and at least one dictionary entry.',
                }),
            );
            return;
        }
        const validated = parsed.data;
        this.reset();
        this.update({
            configuration: validated,
            sessionId: crypto.randomUUID(),
        });
        if (!validated.explanationLanguage) {
            const epoch = this.epoch;
            this.update({ phase: 'loading', busy: true });
            try {
                const prepared = await this.api.prepare(validated);
                if (epoch !== this.epoch) return;
                this.update({
                    configuration: {
                        ...validated,
                        explanationLanguage: prepared.explanationLanguage,
                    },
                    busy: false,
                });
            } catch (error) {
                if (epoch === this.epoch) this.fail(error);
                return;
            }
        }
        await this.next();
    };
    public next = async () => {
        if (
            this.state.busy ||
            this.admitted ||
            this.revealing ||
            !this.state.configuration ||
            !this.state.sessionId
        )
            return;
        // An uncertain admission must be recovered before another paid operation can be issued.
        if (this.state.uncertain) return;
        if (
            this.state.visitedExerciseIds.length >=
            SENTENCE_LIMITS.visitedExercises
        ) {
            this.update({
                phase: 'empty',
                emptyReason: 'review-exhausted',
                exercise: null,
            });
            return;
        }
        const pending: Pending = {
            kind: 'next',
            payload: {
                ...this.state.configuration,
                operationId: crypto.randomUUID(),
                sessionId: this.state.sessionId,
                visitedExerciseIds: [...this.state.visitedExerciseIds],
            },
        };
        this.referencePayload = null;
        this.update({
            phase: 'loading',
            exercise: null,
            draft: '',
            submittedAnswer: null,
            acknowledgedAnswer: null,
            attempt: null,
            reference: null,
            referenceError: null,
            job: null,
            revealedHintIds: [],
            emptyReason: null,
        });
        await this.admit(pending, this.epoch);
    };
    public changeMode = async (mode: SentenceMode) => {
        if (
            this.state.busy ||
            this.admitted ||
            this.revealing ||
            this.state.uncertain ||
            !this.state.configuration
        )
            return;
        this.update({ configuration: { ...this.state.configuration, mode } });
        await this.next();
    };
    public restartReview = async () => {
        if (
            this.state.busy ||
            this.admitted ||
            this.revealing ||
            this.state.uncertain ||
            !this.state.configuration
        )
            return;
        this.update({
            configuration: { ...this.state.configuration, mode: 'review-only' },
            visitedExerciseIds: [],
        });
        await this.next();
    };
    public check = async () => {
        if (
            this.state.busy ||
            this.admitted ||
            this.revealing ||
            !this.state.exercise ||
            !this.state.sessionId ||
            this.state.uncertain
        )
            return;
        const payload = SentenceCheckRequestSchema.safeParse({
            operationId: crypto.randomUUID(),
            sessionId: this.state.sessionId,
            answer: this.state.draft,
            explanationLanguage: this.state.configuration?.explanationLanguage,
            revealedHintIds: [...this.state.revealedHintIds],
        });
        if (!payload.success) {
            this.update({
                error: new ApiError(400, {
                    code: 'invalid_request',
                    correlationId: 'client-answer',
                    message:
                        'Enter a nonblank answer of at most 4,000 characters without control characters.',
                }),
            });
            return;
        }
        this.update({
            submittedAnswer: payload.data.answer,
            attempt: null,
            job: null,
        });
        await this.admit(
            {
                kind: 'check',
                exerciseId: this.state.exercise.id,
                payload: payload.data,
            },
            this.epoch,
        );
    };
    public revealReference = async () => {
        if (
            this.revealing ||
            this.state.reference ||
            !this.state.exercise ||
            !this.state.sessionId
        )
            return;
        if (
            this.state.referenceError?.retryAt &&
            this.state.referenceError.retryAt > Date.now()
        )
            return;
        this.revealing = true;
        const exerciseId = this.state.exercise.id;
        const epoch = this.epoch;
        const pending =
            this.referencePayload?.exerciseId === exerciseId
                ? this.referencePayload
                : {
                      exerciseId,
                      payload: {
                          operationId: crypto.randomUUID(),
                          sessionId: this.state.sessionId,
                      },
                  };
        this.referencePayload = pending;
        this.update({ referenceLoading: true, referenceError: null });
        try {
            const { review } = await this.api.revealReference(
                exerciseId,
                pending.payload,
            );
            if (epoch !== this.epoch || this.state.exercise?.id !== exerciseId)
                return;
            const duplicate = this.reviews.has(review.id);
            this.reviews.add(review.id);
            this.update({
                reference: review,
                referenceLoading: false,
                counts: {
                    ...this.state.counts,
                    manuallyReviewed:
                        this.state.counts.manuallyReviewed +
                        (duplicate ? 0 : 1),
                },
            });
            void this.refreshProgress(epoch);
        } catch (error) {
            if (epoch !== this.epoch) return;
            const converted = toApiError(error);
            if (isAccessLoss(converted) || converted.code === 'stale_content')
                this.fail(error);
            else
                this.update({
                    referenceLoading: false,
                    referenceError: converted,
                });
        } finally {
            if (epoch === this.epoch) {
                this.revealing = false;
                this.update({ referenceLoading: false });
            }
        }
    };
    public retry = async () => {
        if (
            this.admitted ||
            this.polling ||
            this.state.busy ||
            !this.state.canRetry
        )
            return;
        if (this.state.error?.retryAt && this.state.error.retryAt > Date.now())
            return;
        if (this.state.job && activeJob(this.state.job)) {
            this.update({ busy: true, error: null, canRetry: false });
            await this.poll(this.epoch, this.state.job.id);
            return;
        }
        if (!this.pending) return;
        const pending: Pending = this.state.uncertain
            ? this.pending
            : this.pending.kind === 'next'
              ? {
                    kind: 'next',
                    payload: {
                        ...this.pending.payload,
                        operationId: crypto.randomUUID(),
                    },
                }
              : {
                    kind: 'check',
                    exerciseId: this.pending.exerciseId,
                    payload: {
                        ...this.pending.payload,
                        operationId: crypto.randomUUID(),
                    },
                };
        await this.admit(pending, this.epoch);
    };
    public cancel = async () => {
        if (
            this.cancelling ||
            !this.state.job ||
            this.state.job.cancellationRequested ||
            !activeJob(this.state.job)
        )
            return;
        this.cancelling = true;
        this.pollVersion++;
        this.polling = false;
        const epoch = this.epoch;
        const id = this.state.job.id;
        this.clearTimer();
        try {
            this.acceptJob(await this.api.cancelJob(id), epoch);
        } catch (error) {
            if (epoch === this.epoch) this.fail(error);
        } finally {
            if (epoch === this.epoch) this.cancelling = false;
        }
    };
    public setDraft = (draft: string) => {
        if (this.state.busy || this.admitted || this.state.uncertain) return;
        this.update({ draft });
    };
    public toggleHint = (id: string) => {
        if (!this.state.exercise?.hints.some((hint) => hint.id === id)) return;
        // Disclosure is monotonic: hiding a hint cannot remove it from check metadata.
        if (!this.state.revealedHintIds.includes(id))
            this.update({
                revealedHintIds: [...this.state.revealedHintIds, id],
            });
    };
}
