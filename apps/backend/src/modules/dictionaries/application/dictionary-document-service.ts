import type {
    CompleteDictionaryDocumentUploadRequest,
    CreateDictionaryDocumentUploadRequest,
} from '@languon/contracts';

import { documentIngestionLimitsV1 } from '../domain/document-ingestion';
import {
    DictionaryDocumentUploadConflictError,
    DictionaryGenerationNotAvailableError,
    DictionaryRateLimitError,
} from './dictionary-errors';
import type { DictionaryAuthentication } from './ports/dictionary-authentication';
import type { DictionaryCryptography } from './ports/dictionary-cryptography';
import type { DictionaryDocumentStore } from './ports/dictionary-document-store';
import {
    DictionaryDocumentUploadInspectionConflictError,
    DictionaryDocumentUploadInspectionUnavailableError,
    type DictionaryDocumentUploadStorage,
} from './ports/dictionary-document-upload-storage';
import type { DictionaryRateLimiter } from './ports/dictionary-rate-limiter';
import type {
    DictionaryClock,
    DictionaryRequestContext,
} from './dictionary-service';

export class DictionaryDocumentService {
    public constructor(
        private readonly dependencies: {
            authentication: DictionaryAuthentication;
            authorizationEnabled: boolean;
            clock: DictionaryClock;
            cryptography: DictionaryCryptography;
            ocrAvailable?: boolean;
            rateLimiter: DictionaryRateLimiter;
            storage: DictionaryDocumentUploadStorage;
            store: DictionaryDocumentStore;
        },
    ) {}

    public async authorizeUpload(
        accessToken: string,
        idempotencyKey: string,
        dictionaryId: string,
        request: CreateDictionaryDocumentUploadRequest,
        context: DictionaryRequestContext,
    ) {
        if (!this.dependencies.authorizationEnabled)
            throw new DictionaryGenerationNotAvailableError();
        const ownerId = await this.owner(accessToken, context);
        if (
            !this.dependencies.ocrAvailable &&
            ['image/jpeg', 'image/png', 'image/webp'].includes(
                request.mediaType,
            )
        )
            throw new DictionaryGenerationNotAvailableError();
        await this.limitEnqueue(ownerId, context);
        const now = this.dependencies.clock.now();
        const capabilityExpiresAt = new Date(
            now.getTime() + documentIngestionLimitsV1.upload.capabilityTtlMs,
        );
        const authorization = await this.dependencies.store.authorize({
            capabilityExpiresAt,
            context: { now, signal: context.signal },
            dictionaryId,
            expectedChecksumSha256: request.sha256,
            expectedContentType: request.mediaType,
            expectedDictionaryVersion: request.expectedDictionaryVersion,
            expectedSettingsVersion: request.expectedSettingsVersion,
            expectedSizeBytes: request.sizeBytes,
            fingerprint: this.dependencies.cryptography.fingerprint({
                dictionaryId,
                request,
            }),
            idempotencyKey,
            instruction: request.instruction,
            ownerId,
        });
        if (authorization.capabilityExpiresAt <= now)
            throw new DictionaryDocumentUploadConflictError();
        const capability = await this.dependencies.storage.authorizeCreate({
            checksumSha256: request.sha256,
            contentType: request.mediaType,
            expiresAt: authorization.capabilityExpiresAt,
            objectKey: authorization.objectKey,
            signal: context.signal,
            sizeBytes: request.sizeBytes,
        });
        return {
            job: authorization.job,
            upload: {
                expiresAt: authorization.capabilityExpiresAt.toISOString(),
                id: authorization.uploadId,
                ...capability,
            },
        };
    }

    public async completeUpload(
        accessToken: string,
        uploadId: string,
        request: CompleteDictionaryDocumentUploadRequest,
        context: DictionaryRequestContext,
    ) {
        const ownerId = await this.owner(accessToken, context);
        const operationContext = {
            now: this.dependencies.clock.now(),
            signal: context.signal,
        };
        const authorization =
            await this.dependencies.store.readUploadAuthorization({
                context: operationContext,
                ownerId,
                uploadId,
            });
        if (authorization.verifiedStorageVersionId) {
            if (
                request.versionId !== undefined &&
                authorization.verifiedStorageVersionId !== request.versionId
            )
                throw new DictionaryDocumentUploadConflictError();
            return { job: authorization.job };
        }
        if (
            authorization.processingState !== 'authorized' ||
            authorization.capabilityExpiresAt <= operationContext.now
        )
            throw new DictionaryDocumentUploadConflictError();
        let observation;
        try {
            observation = await this.dependencies.storage.inspectVersions({
                expectedChecksumSha256: authorization.expectedChecksumSha256,
                expectedContentType: authorization.expectedContentType,
                expectedSizeBytes: authorization.expectedSizeBytes,
                objectKey: authorization.objectKey,
                requestedVersionId: request.versionId,
                signal: context.signal,
            });
        } catch (error) {
            if (
                error instanceof DictionaryDocumentUploadInspectionConflictError
            )
                throw new DictionaryDocumentUploadConflictError();
            if (
                error instanceof
                DictionaryDocumentUploadInspectionUnavailableError
            )
                throw new DictionaryGenerationNotAvailableError();
            throw error;
        }
        const job = await this.dependencies.store.completeUpload({
            context: operationContext,
            detectedFormat: observation.detectedFormat,
            ownerId,
            requestedVersionId: observation.observedVersionId,
            uploadId,
            versions: observation.versions,
        });
        return { job };
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
        return principal.userId;
    }

    private async limitEnqueue(
        ownerId: string,
        context: DictionaryRequestContext,
    ): Promise<void> {
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
}
