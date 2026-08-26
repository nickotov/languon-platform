import { LANGUAGE_CATALOG, LANGUAGE_CATALOG_VERSION } from '@languon/languages';
import type {
    CreateDictionaryCardRequest,
    CreateDictionaryRequest,
    DictionaryCardLifecycleMutationRequest,
    DictionaryExportFormat,
    DictionaryLifecycleMutationRequest,
    ForkSharedDictionaryRequest,
    ImportDictionaryRequest,
    ListDictionariesQuery,
    ListDictionaryCardsQuery,
    ListSharedDictionaryQuery,
    ReorderDictionaryCardsRequest,
    PreviewDictionaryImportRequest,
    UpdateDictionaryCardRequest,
    UpdateDictionaryRequest,
} from '@languon/contracts';
import { dictionaryInterchangeLimitsV1 } from '@languon/contracts';

import {
    DictionaryGenerationNotAvailableError,
    DictionaryRateLimitError,
    InvalidDictionaryRequestError,
    SharedDictionaryNotFoundError,
} from './dictionary-errors';
import type { DictionaryAuthentication } from './ports/dictionary-authentication';
import type { DictionaryCryptography } from './ports/dictionary-cryptography';
import type { DictionaryRateLimiter } from './ports/dictionary-rate-limiter';
import type { DictionaryStore } from './ports/dictionary-store';
import type { DictionaryGenerationStore } from './ports/dictionary-generation-store';
import {
    createDictionaryInterchangeSerializer,
    parseDictionaryInterchange,
} from '../domain/interchange';

export interface DictionaryClock {
    now(): Date;
}

export interface DictionaryRequestContext {
    clientAddress: string;
    signal: AbortSignal;
}

export interface DictionaryServiceDependencies {
    authentication: DictionaryAuthentication;
    clock: DictionaryClock;
    cryptography: DictionaryCryptography;
    generationStore?: Pick<DictionaryGenerationStore, 'enqueueImportPairs'>;
    rateLimiter: DictionaryRateLimiter;
    store: DictionaryStore;
}

// The 320 MiB envelope must remain viable at a deliberately modest 512 KiB/s
// client throughput, with additional time for snapshot reads and serialization.
const dictionaryExportDeadlineMs = 15 * 60_000;

export class DictionaryService {
    private activeImportPreviews = 0;

    public constructor(
        private readonly dependencies: DictionaryServiceDependencies,
    ) {}

    public languages() {
        return {
            catalogVersion: LANGUAGE_CATALOG_VERSION,
            languages: LANGUAGE_CATALOG.map((language) => ({
                direction: language.direction,
                displayNames: { ...language.displayNames },
                tag: language.tag,
            })),
        };
    }

    public async listDictionaries(
        accessToken: string,
        query: ListDictionariesQuery,
        context: DictionaryRequestContext,
    ) {
        const ownerId = await this.owner(accessToken, context);
        return this.dependencies.store.listDictionaries({
            context: this.context(context),
            ownerId,
            query,
        });
    }

    public async previewDictionaryImport(
        accessToken: string,
        request: PreviewDictionaryImportRequest,
        context: DictionaryRequestContext,
    ) {
        const ownerId = await this.owner(accessToken, context);
        await this.limit('import-preview-owner', ownerId, context);
        await this.limit('import-preview-global', 'global', context);
        if (this.activeImportPreviews >= 4)
            throw new DictionaryRateLimitError(1);
        this.activeImportPreviews += 1;
        try {
            await this.dependencies.store.authorizeDictionaryImportTarget({
                context: this.context(context),
                ownerId,
                requireExpectedVersions: true,
                target: request.target,
            });
            const parsed = parseDictionaryInterchange({
                bytes: new TextEncoder().encode(request.content),
                options: request.options,
            });
            const advisory =
                await this.dependencies.store.previewDictionaryImport({
                    context: this.context(context),
                    ownerId,
                    rows: parsed.rows,
                    target: request.target,
                });
            const warnings = advisory.warnings;
            const previewLimit =
                dictionaryInterchangeLimitsV1.maximumPreviewRows;
            return {
                columns: parsed.columns,
                capacity: {
                    remainingRows: advisory.remainingRows,
                    wouldExceed: parsed.rows.length > advisory.remainingRows,
                },
                failures: parsed.failures.slice(0, previewLimit),
                rows: parsed.rows.slice(0, previewLimit),
                summary: {
                    duplicateRows: warnings.length,
                    failureRows: parsed.failures.length,
                    readyRows: parsed.rows.length,
                    totalRows: parsed.totalRows,
                    truncated:
                        parsed.failures.length > previewLimit ||
                        parsed.rows.length > previewLimit ||
                        warnings.length > previewLimit,
                },
                warnings: warnings.slice(0, previewLimit),
            };
        } finally {
            this.activeImportPreviews -= 1;
        }
    }

    public async importDictionary(
        accessToken: string,
        idempotencyKey: string,
        request: ImportDictionaryRequest,
        context: DictionaryRequestContext,
    ) {
        const ownerId = await this.owner(accessToken, context);
        await this.dependencies.store.authorizeDictionaryImportTarget({
            context: this.context(context),
            ownerId,
            requireExpectedVersions: false,
            target: request.target,
        });
        await this.limit(
            request.enrichment.mode === 'ai'
                ? 'generation-enqueue'
                : 'card-write',
            ownerId,
            context,
        );
        const generationStore =
            request.enrichment.mode === 'ai'
                ? (this.dependencies.generationStore ??
                  (() => {
                      throw new DictionaryGenerationNotAvailableError();
                  })())
                : null;
        const parsed = parseDictionaryInterchange({
            bytes: new TextEncoder().encode(request.content),
            options: request.options,
        });
        const fingerprint = this.dependencies.cryptography.fingerprint(request);
        if (request.enrichment.mode === 'ai') {
            const parsedByIndex = new Map(
                parsed.rows.map((row) => [row.rowIndex, row] as const),
            );
            const rows = [...request.enrichment.selectedRowIndexes]
                .sort((left, right) => left - right)
                .map((rowIndex) => {
                    const row = parsedByIndex.get(rowIndex);
                    if (!row) throw new InvalidDictionaryRequestError();
                    return row;
                });
            return generationStore!.enqueueImportPairs({
                context: this.context(context),
                fingerprint,
                idempotencyKey,
                importFingerprint: this.dependencies.cryptography.fingerprint({
                    options: request.options,
                    rows: parsed.rows,
                }),
                instruction: request.enrichment.instruction,
                ownerId,
                rows,
                target: request.target,
            });
        }
        return this.dependencies.store.importDictionary({
            context: this.context(context),
            fingerprint,
            idempotencyKey,
            ownerId,
            rows: parsed.rows,
            target: request.target,
        });
    }

    public async exportDictionary(
        accessToken: string,
        dictionaryId: string,
        format: DictionaryExportFormat,
        context: DictionaryRequestContext,
    ) {
        const ownerId = await this.owner(accessToken, context);
        const deadlineSignal = AbortSignal.timeout(dictionaryExportDeadlineMs);
        const signal = AbortSignal.any([context.signal, deadlineSignal]);
        const body = new TransformStream<Uint8Array, Uint8Array>();
        const writer = body.writable.getWriter();
        const abortWriter = () => {
            void writer.abort(signal.reason).catch(() => undefined);
        };
        signal.addEventListener('abort', abortWriter, { once: true });
        let serializer: ReturnType<
            typeof createDictionaryInterchangeSerializer
        > | null = null;
        let settleMetadata: (() => void) | null = null;
        let rejectMetadata: ((error: unknown) => void) | null = null;
        const metadataReady = new Promise<void>((resolve, reject) => {
            settleMetadata = resolve;
            rejectMetadata = reject;
        });
        const writeChunks = async (chunks: readonly Uint8Array[]) => {
            for (const chunk of chunks) {
                signal.throwIfAborted();
                await writer.ready;
                await writer.write(chunk);
            }
        };
        void this.dependencies.store
            .streamDictionaryExport({
                context: { now: this.dependencies.clock.now(), signal },
                dictionaryId,
                format,
                onCards: async (cards) => {
                    if (!serializer)
                        throw new Error('Export metadata was not initialized.');
                    await writeChunks(serializer.serializeCards(cards).chunks);
                },
                onMetadata: async (metadata) => {
                    serializer =
                        createDictionaryInterchangeSerializer(metadata);
                    settleMetadata?.();
                },
                ownerId,
            })
            .then(async () => {
                if (!serializer)
                    throw new Error('Export metadata was not initialized.');
                await writeChunks(serializer.finish().chunks);
                await writer.close();
                signal.removeEventListener('abort', abortWriter);
            })
            .catch(async (error: unknown) => {
                signal.removeEventListener('abort', abortWriter);
                rejectMetadata?.(error);
                await writer.abort(error).catch(() => undefined);
            });
        await metadataReady;
        const extension = format === 'quizlet-text' ? 'txt' : 'csv';
        return {
            body: body.readable,
            headers: {
                'cache-control': 'private, no-store' as const,
                'content-disposition':
                    `attachment; filename="dictionary-${dictionaryId}.${extension}"` as const,
                'content-type':
                    format === 'quizlet-text'
                        ? ('text/plain; charset=utf-8' as const)
                        : ('text/csv; charset=utf-8' as const),
                'referrer-policy': 'no-referrer' as const,
                'x-content-type-options': 'nosniff' as const,
            },
        };
    }

    public async createDictionary(
        accessToken: string,
        idempotencyKey: string,
        request: CreateDictionaryRequest,
        context: DictionaryRequestContext,
    ) {
        const ownerId = await this.owner(accessToken, context);
        return this.dependencies.store.createDictionary({
            context: this.context(context),
            fingerprint: this.dependencies.cryptography.fingerprint(request),
            idempotencyKey,
            ownerId,
            request,
        });
    }

    public async readDictionary(
        accessToken: string,
        dictionaryId: string,
        context: DictionaryRequestContext,
    ) {
        const ownerId = await this.owner(accessToken, context);
        return this.dependencies.store.readDictionary({
            context: this.context(context),
            dictionaryId,
            ownerId,
        });
    }

    public async updateDictionary(
        accessToken: string,
        dictionaryId: string,
        request: UpdateDictionaryRequest,
        context: DictionaryRequestContext,
    ) {
        const ownerId = await this.owner(accessToken, context);
        return this.dependencies.store.updateDictionary({
            context: this.context(context),
            dictionaryId,
            ownerId,
            request,
        });
    }

    public async archiveDictionary(
        accessToken: string,
        dictionaryId: string,
        request: DictionaryLifecycleMutationRequest,
        context: DictionaryRequestContext,
    ) {
        const ownerId = await this.owner(accessToken, context);
        return this.dependencies.store.archiveDictionary({
            context: this.context(context),
            dictionaryId,
            ownerId,
            request,
        });
    }

    public async restoreDictionary(
        accessToken: string,
        dictionaryId: string,
        request: DictionaryLifecycleMutationRequest,
        context: DictionaryRequestContext,
    ) {
        const ownerId = await this.owner(accessToken, context);
        return this.dependencies.store.restoreDictionary({
            context: this.context(context),
            dictionaryId,
            ownerId,
            request,
        });
    }

    public async listCards(
        accessToken: string,
        dictionaryId: string,
        query: ListDictionaryCardsQuery,
        context: DictionaryRequestContext,
    ) {
        const ownerId = await this.owner(accessToken, context);
        return this.dependencies.store.listCards({
            context: this.context(context),
            dictionaryId,
            ownerId,
            query,
        });
    }

    public async createCard(
        accessToken: string,
        dictionaryId: string,
        request: CreateDictionaryCardRequest,
        context: DictionaryRequestContext,
    ) {
        const ownerId = await this.owner(accessToken, context);
        await this.limit('card-write', ownerId, context);
        return this.dependencies.store.createCard({
            context: this.context(context),
            dictionaryId,
            ownerId,
            request,
        });
    }

    public async readCard(
        accessToken: string,
        dictionaryId: string,
        cardId: string,
        context: DictionaryRequestContext,
    ) {
        const ownerId = await this.owner(accessToken, context);
        return this.dependencies.store.readCard({
            context: this.context(context),
            dictionaryId,
            cardId,
            ownerId,
        });
    }

    public async updateCard(
        accessToken: string,
        dictionaryId: string,
        cardId: string,
        request: UpdateDictionaryCardRequest,
        context: DictionaryRequestContext,
    ) {
        const ownerId = await this.owner(accessToken, context);
        await this.limit('card-write', ownerId, context);
        return this.dependencies.store.updateCard({
            context: this.context(context),
            dictionaryId,
            cardId,
            ownerId,
            request,
        });
    }

    public async archiveCard(
        accessToken: string,
        dictionaryId: string,
        cardId: string,
        request: DictionaryCardLifecycleMutationRequest,
        context: DictionaryRequestContext,
    ) {
        const ownerId = await this.owner(accessToken, context);
        return this.dependencies.store.archiveCard({
            context: this.context(context),
            dictionaryId,
            cardId,
            ownerId,
            request,
        });
    }

    public async restoreCard(
        accessToken: string,
        dictionaryId: string,
        cardId: string,
        request: DictionaryCardLifecycleMutationRequest,
        context: DictionaryRequestContext,
    ) {
        const ownerId = await this.owner(accessToken, context);
        return this.dependencies.store.restoreCard({
            context: this.context(context),
            dictionaryId,
            cardId,
            ownerId,
            request,
        });
    }

    public async reorderCards(
        accessToken: string,
        dictionaryId: string,
        request: ReorderDictionaryCardsRequest,
        context: DictionaryRequestContext,
    ) {
        const ownerId = await this.owner(accessToken, context);
        return this.dependencies.store.reorderCards({
            context: this.context(context),
            dictionaryId,
            ownerId,
            request,
        });
    }

    public async rotateShare(
        accessToken: string,
        dictionaryId: string,
        expectedDictionaryVersion: number,
        context: DictionaryRequestContext,
    ) {
        const ownerId = await this.owner(accessToken, context);
        const share = this.dependencies.cryptography.issueShare(1);
        const dictionary = await this.dependencies.store.rotateShare({
            context: this.context(context),
            digest: share.digest,
            dictionaryId,
            expectedDictionaryVersion,
            keyVersion: share.version,
            locator: share.locator,
            ownerId,
        });
        return {
            capability: { shareId: share.locator, shareKey: share.key },
            dictionary,
        };
    }

    public async readShared(
        shareId: string,
        shareKey: string,
        query: ListSharedDictionaryQuery,
        context: DictionaryRequestContext,
    ) {
        await this.limit('public', context.clientAddress, context);
        await this.limit(
            'shared-read',
            this.dependencies.cryptography.fingerprint({
                clientAddress: context.clientAddress,
                shareId,
            }),
            context,
        );
        const candidate = await this.dependencies.store.findSharedCandidate({
            context: this.context(context),
            shareId,
        });
        if (
            !this.dependencies.cryptography.verifyShare(
                shareKey,
                candidate?.shareDigest ?? null,
            ) ||
            !candidate
        ) {
            throw new SharedDictionaryNotFoundError();
        }
        return this.dependencies.store.readSharedDictionary({
            context: this.context(context),
            dictionaryId: candidate.dictionaryId,
            query,
            verifiedShareDigest: candidate.shareDigest,
        });
    }

    public async forkShared(
        accessToken: string,
        shareId: string,
        shareKey: string,
        idempotencyKey: string,
        request: ForkSharedDictionaryRequest,
        context: DictionaryRequestContext,
    ) {
        const ownerId = await this.owner(accessToken, context);
        await this.limit('public', context.clientAddress, context);
        await this.limit('fork-owner', ownerId, context);
        await this.limit('fork-global', 'all-forks', context);
        const fingerprint = this.dependencies.cryptography.fingerprint({
            request,
            shareId,
        });
        const replay = await this.dependencies.store.replayForkDictionary({
            context: this.context(context),
            fingerprint,
            idempotencyKey,
            ownerId,
        });
        if (replay) return replay;
        const candidate = await this.dependencies.store.findSharedCandidate({
            context: this.context(context),
            shareId,
        });
        if (
            !this.dependencies.cryptography.verifyShare(
                shareKey,
                candidate?.shareDigest ?? null,
            ) ||
            !candidate
        ) {
            throw new SharedDictionaryNotFoundError();
        }
        return this.dependencies.store.forkSharedDictionary({
            context: this.context(context),
            fingerprint,
            idempotencyKey,
            ownerId,
            request,
            sourceDictionaryId: candidate.dictionaryId,
            verifiedShareDigest: candidate.shareDigest,
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
        await this.limit('owner', principal.userId, context);
        context.signal.throwIfAborted();
        return principal.userId;
    }

    private async limit(
        scope:
            | 'card-write'
            | 'fork-global'
            | 'fork-owner'
            | 'generation-enqueue'
            | 'import-preview-global'
            | 'import-preview-owner'
            | 'owner'
            | 'public'
            | 'shared-read',
        key: string,
        context: DictionaryRequestContext,
    ): Promise<void> {
        const result = await this.dependencies.rateLimiter.consume({
            key,
            scope,
            signal: context.signal,
        });
        if (!result.allowed) {
            throw new DictionaryRateLimitError(result.retryAfterSeconds ?? 60);
        }
    }
}
