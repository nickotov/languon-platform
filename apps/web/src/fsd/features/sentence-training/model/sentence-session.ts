import type {
    SentenceCheckRequest,
    SentenceJob,
    SentenceNextRequest,
    SentenceReferenceRevealRequest,
    SentenceMode,
    SentencePrepareResponse,
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
import { compareReferenceAnswer } from '../lib/reference-comparison';

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
    | 'recompare'
    | 'skip'
    | 'repeatExact'
    | 'generateNew'
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
    comparison: null,
    roundItems: [],
    replaying: false,
    replayPosition: null,
    replayLoading: false,
    replayError: null,
    referenceLoading: false,
    referenceUncertain: false,
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
        skipped: 0,
        ratings: { perfect: 0, good: 0, notBad: 0, practiseAgainLater: 0 },
    },
    busy: false,
    uncertain: false,
    canRetry: false,
    emptyReason: null,
    visitedExerciseIds: [],
    roundEntryCount: 0,
    roundEligibleCount: null,
    roundComplete: false,
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
    private operationUncertain = false;
    private referenceIntent = false;
    private cancelling = false;
    private attempts = new Set<string>();
    private reviews = new Set<string>();
    private coveredEntries = new Set<string>();
    private replayIds: string[] = [];
    private freshSnapshot: State | null = null;
    private freshState: State | null = null;
    private recoveryWaits = new Set<{
        timer: ReturnType<typeof setTimeout>;
        resolve(): void;
    }>();
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
        if (patch.uncertain !== undefined)
            this.operationUncertain = patch.uncertain;
        this.state = { ...this.state, ...patch };
        this.state.uncertain =
            this.operationUncertain || this.state.referenceUncertain;
        const exercise = this.state.exercise;
        if (exercise) {
            this.state.roundItems = this.state.roundItems.map((item) => {
                if (item.exercise.id !== exercise.id) return item;
                const attempt = this.state.attempt ?? item.attempt;
                const reference = this.state.reference ?? item.reference;
                let outcome = item.outcome;
                if (attempt) outcome = 'ai-checked';
                else if (reference) outcome = 'manual-reviewed';
                return {
                    ...item,
                    answer: this.state.draft,
                    attempt,
                    reference,
                    comparison: this.state.comparison ?? item.comparison,
                    revealedHintIds: [...this.state.revealedHintIds],
                    outcome,
                };
            });
        }
        for (const listener of this.listeners) listener();
    }
    private completeFinal() {
        if (
            this.state.roundComplete &&
            !this.state.busy &&
            !this.state.uncertain &&
            !this.hasActiveJob()
        ) {
            this.pending = null;
            this.referencePayload = null;
            this.update({ phase: 'completed', error: null, canRetry: false });
        }
    }
    private hasActiveJob() {
        return this.state.job !== null && activeJob(this.state.job);
    }
    private clearTimer() {
        if (this.timer !== null) clearTimeout(this.timer);
        this.timer = null;
    }
    private async requestWithRetry<T>(
        work: () => Promise<T>,
        epoch: number,
        isCurrent: () => boolean = () => true,
    ): Promise<T> {
        for (let attempt = 0; ; attempt++) {
            try {
                return await work();
            } catch (error) {
                const failure = toApiError(error);
                const transient =
                    isUncertain(failure) ||
                    failure.code === 'capacity_unavailable';
                if (
                    epoch !== this.epoch ||
                    !isCurrent() ||
                    !transient ||
                    attempt >= 2
                )
                    throw error;
                const delay = Math.max(
                    500 * 2 ** attempt,
                    (failure.retryAt ?? 0) - Date.now(),
                );
                if (delay > 30_000) throw error;
                await new Promise<void>((resolve) => {
                    const wait = {
                        timer: setTimeout(() => {
                            this.recoveryWaits.delete(wait);
                            resolve();
                        }, delay),
                        resolve,
                    };
                    this.recoveryWaits.add(wait);
                });
                if (epoch !== this.epoch || !isCurrent()) throw error;
            }
        }
    }
    public reset = () => {
        this.epoch++;
        this.progressVersion++;
        this.pollVersion++;
        this.clearTimer();
        this.pending = null;
        this.referencePayload = null;
        this.admitted = this.polling = this.revealing = this.cancelling = false;
        this.operationUncertain = false;
        this.referenceIntent = false;
        this.attempts.clear();
        this.reviews.clear();
        this.coveredEntries.clear();
        this.replayIds = [];
        this.freshSnapshot = null;
        this.freshState = null;
        for (const wait of this.recoveryWaits) {
            clearTimeout(wait.timer);
            wait.resolve();
        }
        this.recoveryWaits.clear();
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
        if (isAccessLoss(converted) || converted.code === 'stale_content') {
            this.reset();
            this.update({ phase: 'error', error: converted });
            return;
        }
        if (this.freshSnapshot) {
            this.restoreFresh({
                job: this.state.job,
                error: converted,
                uncertain: isUncertain(converted),
                canRetry: this.pending !== null,
            });
            return;
        }
        this.update({
            phase: this.state.exercise ? 'exercise' : 'error',
            error: converted,
            busy: false,
            uncertain: isUncertain(converted),
            canRetry:
                this.pending !== null ||
                (this.state.configuration !== null &&
                    this.state.roundEligibleCount === null),
        });
    }
    private restoreFresh(patch: Partial<State> = {}) {
        if (!this.freshSnapshot) return;
        this.state = { ...this.freshSnapshot };
        this.update({
            phase: 'completed',
            busy: false,
            replayLoading: false,
            ...patch,
        });
    }
    private activateFresh() {
        if (
            this.freshSnapshot &&
            this.freshState &&
            this.state.phase === 'completed'
        )
            this.state = { ...this.freshState };
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
                this.completeFinal();
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
        if (this.freshState) {
            const configuration = this.freshState.configuration;
            const scope = configuration?.scope;
            const outsideScope =
                scope?.type === 'manual' &&
                exercise.segments.some(
                    (segment) =>
                        segment.target &&
                        !scope.entryIds.includes(segment.target.entryId),
                );
            if (
                exercise.direction !== configuration?.direction ||
                outsideScope
            ) {
                this.fail(
                    new ApiError(409, {
                        code: 'stale_content',
                        correlationId: 'fresh-exercise',
                        message:
                            'The generated example does not match this round.',
                    }),
                );
                return;
            }
            this.activateFresh();
        }
        const seen = this.state.visitedExerciseIds.includes(exercise.id);
        const replayPosition = this.state.roundItems.length + 1;
        if (
            exercise.direction !== this.state.configuration?.direction ||
            (this.state.replaying &&
                exercise.id !== this.replayIds[replayPosition - 1])
        ) {
            this.fail(
                new ApiError(409, {
                    code: 'stale_content',
                    correlationId: 'sentence-direction',
                    message:
                        'The exercise does not match the selected direction.',
                }),
            );
            return;
        }
        for (const segment of exercise.segments)
            if (segment.target) this.coveredEntries.add(segment.target.entryId);
        const roundEntryCount = this.coveredEntries.size;
        this.freshSnapshot = null;
        this.freshState = null;
        const roundComplete = this.state.replaying
            ? replayPosition >= this.replayIds.length
            : this.state.roundEligibleCount !== null &&
              roundEntryCount >= this.state.roundEligibleCount;
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
            comparison: null,
            replayPosition: this.state.replaying ? replayPosition : null,
            roundItems: seen
                ? this.state.roundItems
                : [
                      ...this.state.roundItems,
                      {
                          exercise,
                          answer: '',
                          attempt: null,
                          reference: null,
                          comparison: null,
                          revealedHintIds: [],
                          skipped: false,
                          outcome: 'pending',
                      },
                  ],
            referenceLoading: false,
            referenceError: null,
            error: null,
            busy: false,
            uncertain: false,
            canRetry: false,
            visitedExerciseIds: seen
                ? this.state.visitedExerciseIds
                : [...this.state.visitedExerciseIds, exercise.id],
            roundEntryCount,
            roundComplete,
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
            const job = await this.requestWithRetry(
                () => this.api.getJob(id),
                epoch,
                () => version === this.pollVersion,
            );
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
                const job = await this.requestWithRetry(
                    () => this.api.check(pending.exerciseId, pending.payload),
                    epoch,
                );
                this.acceptJob(job, epoch);
            } else {
                const result = await this.requestWithRetry(
                    () => this.api.next(pending.payload),
                    epoch,
                );
                if (epoch !== this.epoch) return;
                if (result.kind === 'job') this.acceptJob(result.job, epoch);
                else if (result.kind === 'exercise') {
                    this.acceptExercise(result.exercise, epoch);
                    this.pending = null;
                } else {
                    if (this.freshSnapshot) {
                        this.fail(
                            new ApiError(409, {
                                code: 'stale_content',
                                correlationId: 'fresh-round',
                                message:
                                    'The round words are no longer available.',
                            }),
                        );
                        return;
                    }
                    this.update({
                        phase: this.state.roundItems.length
                            ? 'completed'
                            : 'empty',
                        roundComplete: this.state.roundItems.length > 0,
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
        {
            const epoch = this.epoch;
            this.update({ phase: 'loading', busy: true });
            try {
                const prepared = await this.requestWithRetry(
                    () => this.api.prepare(validated),
                    epoch,
                );
                if (epoch !== this.epoch) return;
                this.update({
                    configuration: {
                        ...validated,
                        explanationLanguage: prepared.explanationLanguage,
                    },
                    roundEligibleCount: prepared.eligibleCount,
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
            this.state.phase === 'completed' ||
            this.hasActiveJob() ||
            this.state.busy ||
            this.admitted ||
            this.revealing ||
            !this.state.configuration ||
            !this.state.sessionId
        )
            return;
        // An uncertain admission must be recovered before another paid operation can be issued.
        if (this.state.uncertain) return;
        if (this.state.exercise && !this.state.attempt && !this.state.reference)
            this.markSkipped();
        if (this.state.roundComplete) {
            this.completeFinal();
            return;
        }
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
                ...(this.state.replaying
                    ? {
                          replayExerciseId:
                              this.replayIds[this.state.roundItems.length],
                      }
                    : {}),
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
            comparison: null,
            referenceError: null,
            job: null,
            revealedHintIds: [],
            emptyReason: null,
        });
        await this.admit(pending, this.epoch);
    };
    private markSkipped() {
        const id = this.state.exercise?.id;
        const item = this.state.roundItems.find(
            (entry) => entry.exercise.id === id,
        );
        if (!item || item.skipped) return;
        this.update({
            roundItems: this.state.roundItems.map((entry) =>
                entry.exercise.id === id
                    ? { ...entry, skipped: true, outcome: 'skipped' }
                    : entry,
            ),
            counts: {
                ...this.state.counts,
                skipped: this.state.counts.skipped + 1,
            },
        });
    }
    public skip = async () => {
        if (
            this.hasActiveJob() ||
            this.state.busy ||
            this.admitted ||
            this.revealing ||
            this.state.uncertain ||
            this.state.phase !== 'exercise'
        )
            return;
        this.markSkipped();
        await this.next();
    };
    private frozenConfiguration(mode: SentenceMode): Configuration | null {
        if (!this.state.configuration || !this.state.roundItems.length)
            return null;
        const entryIds = [
            ...new Set(
                this.state.roundItems.flatMap((item) =>
                    item.exercise.segments.flatMap((segment) =>
                        segment.target ? [segment.target.entryId] : [],
                    ),
                ),
            ),
        ];
        if (!entryIds.length) return null;
        return {
            ...this.state.configuration,
            mode,
            scope: { type: 'manual', entryIds },
        };
    }
    private beginPreparedRound(
        configuration: Configuration,
        prepared: SentencePrepareResponse,
        replayIds: string[] = [],
    ) {
        this.reset();
        this.replayIds = [...replayIds];
        this.update({
            configuration: {
                ...configuration,
                explanationLanguage: prepared.explanationLanguage,
            },
            sessionId: crypto.randomUUID(),
            roundEligibleCount: prepared.eligibleCount,
            replaying: replayIds.length > 0,
        });
    }
    public repeatExact = async () => {
        if (
            this.state.phase !== 'completed' ||
            this.state.busy ||
            this.state.uncertain
        )
            return;
        const configuration = this.frozenConfiguration('review-only');
        if (!configuration) return;
        const ids = this.state.roundItems.map((item) => item.exercise.id);
        const epoch = this.epoch;
        this.update({ busy: true, replayLoading: true, replayError: null });
        try {
            const prepared = await this.requestWithRetry(
                () =>
                    this.api.prepare({
                        ...configuration,
                        replayExerciseIds: ids,
                    }),
                epoch,
            );
            if (epoch !== this.epoch) return;
            this.beginPreparedRound(configuration, prepared, ids);
            await this.next();
        } catch (error) {
            if (epoch !== this.epoch) return;
            const converted = toApiError(error);
            if (isAccessLoss(converted) || converted.code === 'stale_content')
                this.fail(error);
            else
                this.update({
                    busy: false,
                    replayLoading: false,
                    replayError: converted,
                });
        }
    };
    public generateNew = async () => {
        if (
            this.state.phase !== 'completed' ||
            this.state.busy ||
            this.state.uncertain
        )
            return;
        const frozen = this.frozenConfiguration('new-only');
        if (!frozen) return;
        const { preparedBatchId: _preparedBatchId, ...configuration } = frozen;
        const snapshot = {
            ...this.state,
            progressLoading: false,
            referenceLoading: false,
        };
        const epoch = this.epoch;
        this.pending = null;
        this.update({ busy: true, error: null, replayError: null });
        try {
            const prepared = await this.requestWithRetry(
                () => this.api.prepare(configuration),
                epoch,
            );
            if (epoch !== this.epoch) return;
            this.beginPreparedRound(configuration, prepared);
            this.freshState = { ...this.state, phase: 'loading' };
            this.freshSnapshot = snapshot;
            this.state = { ...snapshot };
            await this.admit(
                {
                    kind: 'next',
                    payload: {
                        ...configuration,
                        explanationLanguage: prepared.explanationLanguage,
                        operationId: crypto.randomUUID(),
                        sessionId: this.freshState.sessionId!,
                        visitedExerciseIds: [],
                    },
                },
                this.epoch,
            );
        } catch (error) {
            if (epoch !== this.epoch) return;
            const converted = toApiError(error);
            if (isAccessLoss(converted) || converted.code === 'stale_content')
                this.fail(error);
            else
                this.update({
                    phase: 'completed',
                    busy: false,
                    error: converted,
                    uncertain: false,
                    canRetry: true,
                });
        }
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
        if (this.state.phase === 'completed') {
            if (mode === 'new-only') await this.generateNew();
            else if (mode === 'review-only') await this.repeatExact();
            else await this.start({ ...this.state.configuration, mode });
            return;
        }
        if (this.state.roundComplete) this.coveredEntries.clear();
        this.update({
            configuration: { ...this.state.configuration, mode },
            ...(this.state.roundComplete
                ? {
                      visitedExerciseIds: [],
                      roundEntryCount: 0,
                      roundComplete: false,
                  }
                : {}),
        });
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
        if (this.state.phase === 'completed') {
            await this.repeatExact();
            return;
        }
        this.update({
            configuration: { ...this.state.configuration, mode: 'review-only' },
            visitedExerciseIds: [],
            roundEntryCount: 0,
            roundComplete: false,
        });
        this.coveredEntries.clear();
        await this.next();
    };
    public check = async () => {
        if (
            this.state.phase === 'completed' ||
            this.hasActiveJob() ||
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
    private referenceComparison(
        answer: string,
        reference: string,
        compare: boolean,
    ) {
        const comparison = compareReferenceAnswer(
            answer,
            reference,
            this.state.exercise?.targetLanguage,
        );
        if (compare) return comparison;
        return { ...comparison, kind: 'reference-only' as const, ignored: [] };
    }
    public revealReference = async () => this.referenceAction(false);
    public recompare = async () => this.referenceAction(true);
    private async referenceAction(compare: boolean) {
        if (
            this.hasActiveJob() ||
            this.state.busy ||
            this.admitted ||
            this.operationUncertain ||
            this.state.phase !== 'exercise' ||
            this.revealing ||
            !this.state.exercise ||
            !this.state.sessionId
        )
            return;
        const answer = this.state.draft;
        if (this.state.reference) {
            this.update({
                comparison: this.referenceComparison(
                    answer,
                    this.state.reference.referenceTranslation,
                    compare,
                ),
                acknowledgedAnswer: answer,
            });
            this.completeFinal();
            return;
        }
        if (
            this.state.referenceError?.retryAt &&
            this.state.referenceError.retryAt > Date.now()
        )
            return;
        this.revealing = true;
        this.referenceIntent = compare;
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
            if (
                review.exercise.id !== exerciseId ||
                review.contentState !== 'current'
            ) {
                this.fail(
                    new ApiError(409, {
                        code: 'stale_content',
                        correlationId: 'reference-content',
                        message: 'The saved reference is no longer current.',
                    }),
                );
                return;
            }
            const duplicate = this.reviews.has(review.id);
            this.reviews.add(review.id);
            this.update({
                reference: review,
                comparison: this.referenceComparison(
                    answer,
                    review.referenceTranslation,
                    compare,
                ),
                acknowledgedAnswer: answer,
                referenceLoading: false,
                referenceUncertain: false,
                counts: {
                    ...this.state.counts,
                    manuallyReviewed:
                        this.state.counts.manuallyReviewed +
                        (duplicate ? 0 : 1),
                },
            });
            this.completeFinal();
            void this.refreshProgress(epoch);
        } catch (error) {
            if (epoch !== this.epoch) return;
            const converted = toApiError(error);
            if (isAccessLoss(converted) || converted.code === 'stale_content')
                this.fail(error);
            else
                this.update({
                    referenceLoading: false,
                    referenceUncertain:
                        this.state.referenceUncertain || isUncertain(converted),
                    referenceError: converted,
                });
        } finally {
            if (epoch === this.epoch) {
                this.revealing = false;
                this.update({ referenceLoading: false });
            }
        }
    }
    public retry = async () => {
        if (this.state.referenceUncertain) {
            await this.referenceAction(this.referenceIntent);
            return;
        }
        if (
            this.admitted ||
            this.polling ||
            this.state.busy ||
            !this.state.canRetry
        )
            return;
        if (this.state.error?.retryAt && this.state.error.retryAt > Date.now())
            return;
        if (
            this.state.roundEligibleCount === null &&
            this.state.configuration
        ) {
            const configuration = this.state.configuration;
            // Preparation is read-only: no admission or draft needs recovery.
            this.update({ uncertain: false });
            await this.start(configuration);
            return;
        }
        if (this.state.job && activeJob(this.state.job)) {
            const job = this.state.job;
            this.update({ job, busy: true, error: null, canRetry: false });
            await this.poll(this.epoch, job.id);
            return;
        }
        if (!this.pending) {
            if (this.state.phase === 'completed') await this.generateNew();
            return;
        }
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
        if (
            this.state.phase !== 'exercise' ||
            this.state.busy ||
            this.admitted ||
            this.state.uncertain
        )
            return;
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
