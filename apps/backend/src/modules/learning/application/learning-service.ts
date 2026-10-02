import type {
    FlashcardAttemptRequest,
    FlashcardItemsRequest,
    FlashcardPreferencesPutRequest,
    FlashcardPrepareRequest,
    FlashcardUndoRequest,
    LearningEntriesQuery,
} from '@languon/contracts';
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
import type {
    LearningAccess,
    LearningContext,
    LearningStore,
} from './ports/learning-store';

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
export interface LearningServiceDependencies {
    clock: { now(): Date };
    authentication: DictionaryAuthentication;
    cryptography: DictionaryCryptography;
    dictionaries: Pick<DictionaryStore, 'findSharedCandidate'>;
    enabled: boolean;
    rateLimiter: RateLimiter;
    store: LearningStore;
}

/** Authentication and bounded request admission; the store rechecks access transactionally. */
export class LearningService {
    public constructor(
        private readonly dependencies: LearningServiceDependencies,
    ) {}

    public capabilities() {
        return { flashcardsEnabled: this.dependencies.enabled };
    }
    public listEntries(
        target: LearningTarget,
        input: LearningEntriesQuery,
        context: LearningRequestContext,
    ) {
        return this.run(target, context, 'content', false, (access) =>
            this.dependencies.store.listEntries(access, input, context),
        );
    }
    public getPreferences(
        target: LearningTarget,
        context: LearningRequestContext,
    ) {
        return this.run(target, context, 'content', true, (access) =>
            this.dependencies.store.getPreferences(access, context),
        );
    }
    public savePreferences(
        target: LearningTarget,
        input: FlashcardPreferencesPutRequest,
        context: LearningRequestContext,
    ) {
        return this.run(target, context, 'write', true, (access) =>
            this.dependencies.store.savePreferences(access, input, context),
        );
    }
    public prepare(
        target: LearningTarget,
        input: FlashcardPrepareRequest,
        context: LearningRequestContext,
    ) {
        return this.run(target, context, 'prepare', false, (access) =>
            this.dependencies.store.prepare(access, input, context),
        );
    }
    public items(
        target: LearningTarget,
        input: FlashcardItemsRequest,
        context: LearningRequestContext,
    ) {
        return this.run(target, context, 'content', false, (access) =>
            this.dependencies.store.items(access, input, context),
        );
    }
    public progress(target: LearningTarget, context: LearningRequestContext) {
        return this.run(target, context, 'content', true, (access) =>
            this.dependencies.store.progress(access, context),
        );
    }
    public recordAttempt(
        target: LearningTarget,
        input: FlashcardAttemptRequest,
        context: LearningRequestContext,
    ) {
        return this.run(target, context, 'write', true, (access) =>
            this.dependencies.store.recordAttempt(access, input, context),
        );
    }
    public undo(
        target: LearningTarget,
        attemptId: string,
        input: FlashcardUndoRequest,
        context: LearningRequestContext,
    ) {
        return this.run(target, context, 'write', true, (access) =>
            this.dependencies.store.undo(access, attemptId, input, context),
        );
    }

    private async run<T>(
        target: LearningTarget,
        context: LearningRequestContext,
        scope: 'prepare' | 'content' | 'write',
        personal: boolean,
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
        if ((target.kind === 'owner' || personal) && !principal)
            throw new LearningAuthenticationRequiredError();
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
                learnerId: principal?.userId ?? null,
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
                scope: `learning.${scope}`,
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
