import type {
    SentencePrepareRequest,
    SentenceNextRequest,
    SentenceCheckRequest,
    SentenceAttemptsQuery,
    SentenceProgressQuery,
    SentenceReferenceRevealRequest,
    SentenceManualReviewsQuery,
} from '@languon/contracts';
import type { SentencePracticeStore } from './ports/sentence-practice-store';
import type { DictionaryAuthentication } from '../../dictionaries/application/ports/dictionary-authentication';
import type { DictionaryCryptography } from '../../dictionaries/application/ports/dictionary-cryptography';
import type { DictionaryStore } from '../../dictionaries/application/ports/dictionary-store';
import {
    DictionaryRateLimitError,
    DictionaryServiceUnavailableError,
    SharedDictionaryNotFoundError,
} from '../../dictionaries/application/dictionary-errors';
import {
    RateLimitUnavailableError,
    type RateLimiter,
} from '../../authentication/application/ports/rate-limiter';
import { LearningAuthenticationRequiredError } from '../domain/errors';
import type { LearningAccess, LearningContext } from './ports/learning-store';

export type LearningTarget =
    | { kind: 'owner'; dictionaryId: string; accessToken?: string }
    | {
          kind: 'shared';
          shareId: string;
          shareKey: string;
          accessToken?: string;
      };
export interface LearningRequestContext extends LearningContext {
    clientAddress: string;
}
export interface SentencePracticeServiceDependencies {
    clock: { now(): Date };
    authentication: DictionaryAuthentication;
    cryptography: DictionaryCryptography;
    dictionaries: Pick<DictionaryStore, 'findSharedCandidate'>;
    enabled: boolean;
    rateLimiter: RateLimiter;
    store: SentencePracticeStore;
}

/** Authentication and bounded request admission; the store rechecks access transactionally. */
export class SentencePracticeService {
    public constructor(
        private readonly dependencies: SentencePracticeServiceDependencies,
    ) {}

    public capabilities() {
        return { sentencesEnabled: this.dependencies.enabled };
    }
    public prepare(
        target: LearningTarget,
        input: SentencePrepareRequest,
        context: LearningRequestContext,
    ) {
        return this.run(target, context, 'prepare', (access) =>
            this.dependencies.store.prepare(access, input, {
                now: this.dependencies.clock.now(),
                signal: context.signal,
            }),
        );
    }
    public next(
        target: LearningTarget,
        input: SentenceNextRequest,
        context: LearningRequestContext,
    ) {
        return this.run(target, context, 'prepare', (access) =>
            this.dependencies.store.next(access, input, {
                now: this.dependencies.clock.now(),
                signal: context.signal,
            }),
        );
    }
    public getJob(
        target: LearningTarget,
        jobId: string,
        context: LearningRequestContext,
    ) {
        return this.run(target, context, 'content', (access) =>
            this.dependencies.store.getJob(access, jobId, {
                now: this.dependencies.clock.now(),
                signal: context.signal,
            }),
        );
    }
    public cancelJob(
        target: LearningTarget,
        jobId: string,
        context: LearningRequestContext,
    ) {
        return this.run(target, context, 'write', (access) =>
            this.dependencies.store.cancelJob(access, jobId, {
                now: this.dependencies.clock.now(),
                signal: context.signal,
            }),
        );
    }
    public enqueueCheck(
        target: LearningTarget,
        exerciseId: string,
        input: SentenceCheckRequest,
        context: LearningRequestContext,
    ) {
        return this.run(target, context, 'write', (access) =>
            this.dependencies.store.enqueueCheck(access, exerciseId, input, {
                now: this.dependencies.clock.now(),
                signal: context.signal,
            }),
        );
    }
    public attempts(
        target: LearningTarget,
        query: SentenceAttemptsQuery,
        context: LearningRequestContext,
    ) {
        return this.run(target, context, 'content', (access) =>
            this.dependencies.store.attempts(access, query, {
                now: this.dependencies.clock.now(),
                signal: context.signal,
            }),
        );
    }
    public progress(
        target: LearningTarget,
        query: SentenceProgressQuery,
        context: LearningRequestContext,
    ) {
        return this.run(target, context, 'content', (access) =>
            this.dependencies.store.progress(access, query, {
                now: this.dependencies.clock.now(),
                signal: context.signal,
            }),
        );
    }

    /** Reads the saved answer without invoking any AI admission or credit machinery. */
    public revealReference(
        target: LearningTarget,
        exerciseId: string,
        input: SentenceReferenceRevealRequest,
        context: LearningRequestContext,
    ) {
        return this.run(target, context, 'write', (access) =>
            this.dependencies.store.revealReference(access, exerciseId, input, {
                now: this.dependencies.clock.now(),
                signal: context.signal,
            }),
        );
    }
    public manualReviews(
        target: LearningTarget,
        query: SentenceManualReviewsQuery,
        context: LearningRequestContext,
    ) {
        return this.run(target, context, 'content', (access) =>
            this.dependencies.store.manualReviews(access, query, {
                now: this.dependencies.clock.now(),
                signal: context.signal,
            }),
        );
    }

    private async run<T>(
        target: LearningTarget,
        context: LearningRequestContext,
        scope: 'prepare' | 'content' | 'write',
        action: (access: LearningAccess) => Promise<T>,
    ): Promise<T> {
        context.signal.throwIfAborted();
        if (!this.dependencies.enabled)
            throw new DictionaryServiceUnavailableError();
        // Public admission is before authentication/capability lookup, and does not trust forwarded headers.
        await this.limit('public', context.clientAddress, 180, context);
        const principal =
            target.accessToken === undefined
                ? null
                : await this.dependencies.authentication.authenticate(
                      target.accessToken,
                  );
        if (!principal) throw new LearningAuthenticationRequiredError();
        const subject = principal?.userId ?? context.clientAddress;
        await this.limit(
            `${scope}.${principal ? 'learner' : 'visitor'}`,
            subject,
            scope === 'prepare' ? 20 : scope === 'write' ? 180 : 180,
            context,
        );
        let access: LearningAccess;
        if (target.kind === 'owner') {
            access = {
                kind: 'owner',
                dictionaryId: target.dictionaryId,
                learnerId: principal!.userId,
            };
        } else {
            const candidate =
                await this.dependencies.dictionaries.findSharedCandidate({
                    shareId: target.shareId,
                    context: {
                        signal: context.signal,
                        now: this.dependencies.clock.now(),
                    },
                });
            if (
                !this.dependencies.cryptography.verifyShare(
                    target.shareKey,
                    candidate?.shareDigest ?? null,
                ) ||
                !candidate
            )
                throw new SharedDictionaryNotFoundError();
            access = {
                kind: 'shared',
                shareId: target.shareId,
                keyDigest: candidate.shareDigest,
                learnerId: principal.userId,
            };
        }
        context.signal.throwIfAborted();
        return action(access);
    }

    private async limit(
        scope: string,
        subject: string,
        limit: number,
        context: LearningRequestContext,
    ) {
        try {
            const decision = await this.dependencies.rateLimiter.consume({
                scope: `learning.sentences.${scope}`,
                subject: this.dependencies.cryptography.fingerprint({
                    scope,
                    subject,
                }),
                limit,
                windowMs: 60_000,
                signal: context.signal,
            });
            if (!decision.allowed)
                throw new DictionaryRateLimitError(decision.retryAfterSeconds);
        } catch (error) {
            if (context.signal.aborted) throw error;
            if (error instanceof RateLimitUnavailableError)
                throw new DictionaryServiceUnavailableError();
            throw error;
        }
    }
}
