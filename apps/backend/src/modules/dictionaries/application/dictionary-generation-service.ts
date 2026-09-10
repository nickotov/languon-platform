import type {
    AcceptDictionaryCardAuthoringGenerationJobRequest,
    AcceptDictionaryGenerationJobRequest,
    EnqueueDictionaryCardAuthoringGenerationRequest,
    EnqueueDictionaryCardGenerationRequest,
    EnqueueDictionaryPastedTermsGenerationRequest,
    RegenerateDictionaryCardAuthoringGenerationRequest,
    RegenerateDictionaryGenerationJobRequest,
    RetryDictionaryImportPairsGenerationRequest,
    RetryDictionaryDocumentTermsGenerationRequest,
    RetryDictionaryPastedTermsGenerationRequest,
} from '@languon/contracts';

import {
    dictionaryGenerationFormat,
    dictionaryImportPairsGenerationFormat,
    dictionaryPastedTermsGenerationFormat,
} from '../domain/generation';
import { parseDictionaryBatchGenerationText } from '../domain/batch-generation';
import { dictionaryCardAuthoringGenerationFormat } from '../domain/card-authoring';
import {
    DictionaryGenerationNotAvailableError,
    DictionaryRateLimitError,
} from './dictionary-errors';
import type { DictionaryAuthentication } from './ports/dictionary-authentication';
import type { DictionaryCryptography } from './ports/dictionary-cryptography';
import type { DictionaryGenerationStore } from './ports/dictionary-generation-store';
import type { DictionaryRateLimiter } from './ports/dictionary-rate-limiter';
import type {
    DictionaryClock,
    DictionaryRequestContext,
} from './dictionary-service';

export interface DictionaryGenerationApiCapabilities {
    acceptableFormats: readonly string[];
    cancellableFormats: readonly string[];
    discardableFormats: readonly string[];
    enqueuedFormats: readonly string[];
    readableFormats: readonly string[];
    documentOcrAvailable?: boolean;
}

export class DictionaryGenerationService {
    public constructor(
        private readonly dependencies: {
            authentication: DictionaryAuthentication;
            capabilities: DictionaryGenerationApiCapabilities;
            clock: DictionaryClock;
            cryptography: DictionaryCryptography;
            rateLimiter: DictionaryRateLimiter;
            store: DictionaryGenerationStore;
        },
    ) {}

    public async capabilities(
        accessToken: string,
        context: DictionaryRequestContext,
    ) {
        await this.owner(accessToken, context);
        return {
            cardAuthoringGeneration: {
                available: this.supports(
                    'enqueued',
                    dictionaryCardAuthoringGenerationFormat,
                ),
            },
            documentOcr: {
                available:
                    this.dependencies.capabilities.documentOcrAvailable ??
                    false,
            },
            documentTermsGeneration: {
                available: this.supports('enqueued', 'document-terms:v1'),
            },
            importPairsGeneration: {
                available: this.supports(
                    'enqueued',
                    dictionaryImportPairsGenerationFormat,
                ),
            },
            pastedTermsGeneration: {
                available: this.supports(
                    'enqueued',
                    dictionaryPastedTermsGenerationFormat,
                ),
            },
            singleCardGeneration: {
                available: this.supports(
                    'enqueued',
                    dictionaryGenerationFormat,
                ),
            },
        };
    }

    public async enqueueCardAuthoring(
        accessToken: string,
        idempotencyKey: string,
        dictionaryId: string,
        request: EnqueueDictionaryCardAuthoringGenerationRequest,
        context: DictionaryRequestContext,
    ) {
        const ownerId = await this.owner(accessToken, context);
        this.requireSupport(
            'enqueued',
            dictionaryCardAuthoringGenerationFormat,
        );
        await this.limitEnqueue(ownerId, context);
        return this.dependencies.store.enqueueCardAuthoring({
            context: this.context(context),
            dictionaryId,
            draft: request.draft,
            expectedDictionaryVersion: request.expectedDictionaryVersion,
            expectedSettingsVersion: request.expectedSettingsVersion,
            fingerprint: this.dependencies.cryptography.fingerprint({
                dictionaryId,
                request,
            }),
            idempotencyKey,
            ownerId,
            scope: request.scope,
            source: request.source,
        });
    }

    public async enqueuePastedTerms(
        accessToken: string,
        idempotencyKey: string,
        dictionaryId: string,
        request: EnqueueDictionaryPastedTermsGenerationRequest,
        context: DictionaryRequestContext,
    ) {
        const ownerId = await this.owner(accessToken, context);
        this.requireSupport('enqueued', dictionaryPastedTermsGenerationFormat);
        await this.limitEnqueue(ownerId, context);
        parseDictionaryBatchGenerationText(request.text);
        return this.dependencies.store.enqueuePastedTerms({
            context: this.context(context),
            dictionaryId,
            expectedDictionaryVersion: request.expectedDictionaryVersion,
            expectedSettingsVersion: request.expectedSettingsVersion,
            fingerprint: this.dependencies.cryptography.fingerprint({
                dictionaryId,
                request,
            }),
            idempotencyKey,
            ownerId,
            sharedContext: request.context,
            text: request.text,
        });
    }

    public async enqueue(
        accessToken: string,
        idempotencyKey: string,
        dictionaryId: string,
        cardId: string,
        request: EnqueueDictionaryCardGenerationRequest,
        context: DictionaryRequestContext,
    ) {
        const ownerId = await this.owner(accessToken, context);
        this.requireSupport('enqueued', dictionaryGenerationFormat);
        await this.limitEnqueue(ownerId, context);
        return this.dependencies.store.enqueue({
            cardId,
            context: this.context(context),
            dictionaryId,
            expectedCardVersion: request.expectedCardVersion,
            expectedDictionaryVersion: request.expectedDictionaryVersion,
            expectedSettingsVersion: request.expectedSettingsVersion,
            fingerprint: this.dependencies.cryptography.fingerprint({
                cardId,
                dictionaryId,
                request,
            }),
            idempotencyKey,
            instruction: request.instruction,
            ownerId,
        });
    }

    public async retryPastedTerms(
        accessToken: string,
        idempotencyKey: string,
        jobId: string,
        request: RetryDictionaryPastedTermsGenerationRequest,
        context: DictionaryRequestContext,
    ) {
        const ownerId = await this.owner(accessToken, context);
        this.requireSupport('enqueued', dictionaryPastedTermsGenerationFormat);
        await this.limitEnqueue(ownerId, context);
        const prior = await this.dependencies.store.read({
            context: this.context(context),
            jobId,
            ownerId,
        });
        this.requireSupport('readable', prior.format);
        if (prior.kind !== 'pasted-terms')
            throw new DictionaryGenerationNotAvailableError();
        const rowIndexes = [...request.rowIndexes].sort(
            (left, right) => left - right,
        );
        return this.dependencies.store.enqueuePastedTerms({
            context: this.context(context),
            dictionaryId: prior.dictionaryId,
            expectedDictionaryVersion: request.expectedDictionaryVersion,
            expectedSettingsVersion: request.expectedSettingsVersion,
            fingerprint: this.dependencies.cryptography.fingerprint({
                priorJobId: jobId,
                request: { ...request, rowIndexes },
            }),
            idempotencyKey,
            ownerId,
            retry: { jobId, rowIndexes },
        });
    }

    public async retryDocumentTerms(
        accessToken: string,
        idempotencyKey: string,
        jobId: string,
        request: RetryDictionaryDocumentTermsGenerationRequest,
        context: DictionaryRequestContext,
    ) {
        const ownerId = await this.owner(accessToken, context);
        this.requireSupport('enqueued', dictionaryPastedTermsGenerationFormat);
        await this.limitEnqueue(ownerId, context);
        const prior = await this.dependencies.store.read({
            context: this.context(context),
            jobId,
            ownerId,
        });
        this.requireSupport('readable', prior.format);
        if (prior.kind !== 'document-terms')
            throw new DictionaryGenerationNotAvailableError();
        const rowIndexes = [...request.rowIndexes].sort(
            (left, right) => left - right,
        );
        return this.dependencies.store.enqueueDocumentFailureRetry({
            context: this.context(context),
            dictionaryId: prior.dictionaryId,
            expectedDictionaryVersion: request.expectedDictionaryVersion,
            expectedSettingsVersion: request.expectedSettingsVersion,
            fingerprint: this.dependencies.cryptography.fingerprint({
                priorJobId: jobId,
                request: { ...request, rowIndexes },
            }),
            idempotencyKey,
            ownerId,
            predecessorJobId: jobId,
            rowIndexes,
        });
    }

    public async retryImportPairs(
        accessToken: string,
        idempotencyKey: string,
        jobId: string,
        request: RetryDictionaryImportPairsGenerationRequest,
        context: DictionaryRequestContext,
    ) {
        const ownerId = await this.owner(accessToken, context);
        this.requireSupport('enqueued', dictionaryImportPairsGenerationFormat);
        await this.limitEnqueue(ownerId, context);
        const prior = await this.dependencies.store.read({
            context: this.context(context),
            jobId,
            ownerId,
        });
        this.requireSupport('readable', prior.format);
        if (prior.kind !== 'import-pairs')
            throw new DictionaryGenerationNotAvailableError();
        const rowIndexes = [...request.rowIndexes].sort(
            (left, right) => left - right,
        );
        return this.dependencies.store.enqueueImportPairsRetry({
            context: this.context(context),
            expectedDictionaryVersion: request.expectedDictionaryVersion,
            expectedSettingsVersion: request.expectedSettingsVersion,
            fingerprint: this.dependencies.cryptography.fingerprint({
                priorJobId: jobId,
                request: { ...request, rowIndexes },
            }),
            idempotencyKey,
            ownerId,
            predecessorJobId: jobId,
            rowIndexes,
        });
    }

    public async latest(
        accessToken: string,
        dictionaryId: string,
        cardId: string,
        context: DictionaryRequestContext,
    ) {
        const ownerId = await this.owner(accessToken, context);
        const job = await this.dependencies.store.latestForCard({
            cardId,
            context: this.context(context),
            dictionaryId,
            ownerId,
        });
        if (job) this.requireSupport('readable', job.format);
        return job;
    }

    public async read(
        accessToken: string,
        jobId: string,
        context: DictionaryRequestContext,
    ) {
        const ownerId = await this.owner(accessToken, context);
        const job = await this.dependencies.store.read({
            context: this.context(context),
            jobId,
            ownerId,
        });
        this.requireSupport('readable', job.format);
        return job;
    }

    public async cancel(
        accessToken: string,
        jobId: string,
        context: DictionaryRequestContext,
    ) {
        const ownerId = await this.owner(accessToken, context);
        const job = await this.dependencies.store.read({
            context: this.context(context),
            jobId,
            ownerId,
        });
        this.requireSupport('cancellable', job.format);
        return this.dependencies.store.cancel({
            context: this.context(context),
            jobId,
            ownerId,
        });
    }

    public async discard(
        accessToken: string,
        jobId: string,
        context: DictionaryRequestContext,
    ) {
        const ownerId = await this.owner(accessToken, context);
        const job = await this.dependencies.store.read({
            context: this.context(context),
            jobId,
            ownerId,
        });
        this.requireSupport('discardable', job.format);
        return this.dependencies.store.discard({
            context: this.context(context),
            jobId,
            ownerId,
        });
    }

    public async accept(
        accessToken: string,
        jobId: string,
        request: AcceptDictionaryGenerationJobRequest,
        context: DictionaryRequestContext,
    ) {
        const ownerId = await this.owner(accessToken, context);
        const job = await this.dependencies.store.read({
            context: this.context(context),
            jobId,
            ownerId,
        });
        this.requireSupport('acceptable', job.format);
        if (
            'format' in request &&
            request.format === dictionaryCardAuthoringGenerationFormat
        ) {
            if (job.kind !== 'card-authoring')
                throw new DictionaryGenerationNotAvailableError();
            const authoringRequest =
                request as AcceptDictionaryCardAuthoringGenerationJobRequest;
            const selectedSuggestions = [
                ...authoringRequest.selectedSuggestions,
            ].sort((left, right) => left.field.localeCompare(right.field));
            return this.dependencies.store.acceptCardAuthoring({
                acceptanceFingerprint:
                    this.dependencies.cryptography.fingerprint({
                        candidate: authoringRequest.candidate,
                        format: authoringRequest.format,
                        selectedSuggestions,
                    }),
                candidate: authoringRequest.candidate,
                context: this.context(context),
                jobId,
                ownerId,
                selectedSuggestions,
            });
        }
        if ('format' in request) {
            if (
                job.kind !== 'pasted-terms' &&
                job.kind !== 'document-terms' &&
                job.kind !== 'import-pairs'
            )
                throw new DictionaryGenerationNotAvailableError();
            if (request.format !== job.format)
                throw new DictionaryGenerationNotAvailableError();
            const selected = [...request.selected].sort(
                (left, right) => left.rowIndex - right.rowIndex,
            );
            return this.dependencies.store.acceptBatch({
                acceptanceFingerprint:
                    this.dependencies.cryptography.fingerprint({
                        format: request.format,
                        selected,
                    }),
                context: this.context(context),
                jobId,
                ownerId,
                selected,
            });
        }
        if (job.kind !== 'single-card')
            throw new DictionaryGenerationNotAvailableError();
        return this.dependencies.store.acceptSingleCard({
            candidate: request.candidate,
            candidateFingerprint: this.dependencies.cryptography.fingerprint(
                request.candidate,
            ),
            context: this.context(context),
            jobId,
            ownerId,
        });
    }

    public async regenerateCardAuthoring(
        accessToken: string,
        jobId: string,
        idempotencyKey: string,
        request: RegenerateDictionaryCardAuthoringGenerationRequest,
        context: DictionaryRequestContext,
    ) {
        const ownerId = await this.owner(accessToken, context);
        this.requireSupport(
            'enqueued',
            dictionaryCardAuthoringGenerationFormat,
        );
        await this.limitEnqueue(ownerId, context);
        const prior = await this.dependencies.store.read({
            context: this.context(context),
            jobId,
            ownerId,
        });
        this.requireSupport('readable', prior.format);
        if (prior.kind !== 'card-authoring' || prior.format !== request.format)
            throw new DictionaryGenerationNotAvailableError();
        const discardedSuggestionIds = [
            ...request.discardedSuggestionIds,
        ].sort();
        return this.dependencies.store.enqueueCardAuthoring({
            context: this.context(context),
            dictionaryId: prior.dictionaryId,
            draft: request.draft,
            expectedDictionaryVersion: request.expectedDictionaryVersion,
            expectedSettingsVersion: request.expectedSettingsVersion,
            fingerprint: this.dependencies.cryptography.fingerprint({
                priorJobId: jobId,
                request: { ...request, discardedSuggestionIds },
            }),
            idempotencyKey,
            ownerId,
            predecessor: { discardedSuggestionIds, jobId },
            scope: request.scope,
            source: request.source,
        });
    }

    public async regenerate(
        accessToken: string,
        jobId: string,
        idempotencyKey: string,
        request: RegenerateDictionaryGenerationJobRequest,
        context: DictionaryRequestContext,
    ) {
        const ownerId = await this.owner(accessToken, context);
        this.requireSupport('enqueued', dictionaryGenerationFormat);
        await this.limitEnqueue(ownerId, context);
        const prior = await this.dependencies.store.read({
            context: this.context(context),
            jobId,
            ownerId,
        });
        this.requireSupport('readable', prior.format);
        if (prior.kind !== 'single-card')
            throw new DictionaryGenerationNotAvailableError();
        return this.dependencies.store.enqueue({
            cardId: prior.cardId,
            context: this.context(context),
            dictionaryId: prior.dictionaryId,
            expectedCardVersion: request.expectedCardVersion,
            expectedDictionaryVersion: request.expectedDictionaryVersion,
            expectedSettingsVersion: request.expectedSettingsVersion,
            fingerprint: this.dependencies.cryptography.fingerprint({
                priorJobId: jobId,
                request,
            }),
            idempotencyKey,
            instruction: request.instruction,
            ownerId,
        });
    }

    private context(context: DictionaryRequestContext) {
        context.signal.throwIfAborted();
        return { now: this.dependencies.clock.now(), signal: context.signal };
    }

    private async owner(
        accessToken: string,
        context: DictionaryRequestContext,
    ): Promise<string> {
        context.signal.throwIfAborted();
        const principal =
            await this.dependencies.authentication.authenticate(accessToken);
        const decision = await this.dependencies.rateLimiter.consume({
            key: principal.userId,
            scope: 'owner',
            signal: context.signal,
        });
        if (!decision.allowed)
            throw new DictionaryRateLimitError(
                decision.retryAfterSeconds ?? 60,
            );
        context.signal.throwIfAborted();
        return principal.userId;
    }

    private async limitEnqueue(
        ownerId: string,
        context: DictionaryRequestContext,
    ) {
        const decision = await this.dependencies.rateLimiter.consume({
            key: ownerId,
            scope: 'generation-enqueue',
            signal: context.signal,
        });
        if (!decision.allowed)
            throw new DictionaryRateLimitError(
                decision.retryAfterSeconds ?? 60,
            );
    }

    private requireSupport(
        capability:
            | 'acceptable'
            | 'cancellable'
            | 'discardable'
            | 'enqueued'
            | 'readable',
        format: string,
    ): void {
        if (!this.supports(capability, format))
            throw new DictionaryGenerationNotAvailableError();
    }

    private supports(
        capability:
            | 'acceptable'
            | 'cancellable'
            | 'discardable'
            | 'enqueued'
            | 'readable',
        format: string,
    ): boolean {
        return this.dependencies.capabilities[`${capability}Formats`].includes(
            format,
        );
    }
}
