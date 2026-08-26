import {
    chunkDictionaryBatchGenerationRows,
    parseDictionaryBatchGenerationProposal,
} from '../domain/batch-generation';
import {
    classifyDictionaryDocumentTerms,
    DictionaryDocumentBlockSchema,
    documentIngestionLimitsV1,
    validateDictionaryDocumentBlocks,
    type DictionaryDocumentBlock,
} from '../domain/document-ingestion';
import type { DictionaryDocumentTermsGenerationInputPayload } from '../domain/generation';
import { dictionaryGenerationProviderUsageCostMicros } from './ports/dictionary-generation-provider-policy';
import type { DictionaryGenerationProviderBudgetPolicy } from './ports/dictionary-generation-provider-policy';
import type { DocumentMalwareScanner } from './ports/document-malware-scanner';
import {
    DocumentOcrUnavailableError,
    type DocumentOcrProvider,
} from './ports/document-ocr-provider';
import type { DictionaryGenerationExecutionStage } from './ports/dictionary-generation-format-executor';
import type {
    DictionaryDocumentObjectReference,
    PrivateDocumentStorage,
} from './ports/private-document-storage';
import type { PastedTermsProposalGenerator } from './ports/pasted-terms-proposal-generator';
import type { SandboxedDocumentExtractor } from './ports/sandboxed-document-extractor';

export type DictionaryDocumentGenerationFailureCategory =
    | 'extraction_failed'
    | 'invalid_document'
    | 'malware_detected'
    | 'no_terms_found'
    | 'ocr_failed'
    | 'provider_unavailable'
    | 'scan_failed'
    | 'too_many_terms';

export class DictionaryDocumentGenerationError extends Error {
    public constructor(
        public readonly category: DictionaryDocumentGenerationFailureCategory,
        public readonly retryable: boolean,
        public readonly extraction?: {
            fingerprint: string;
            observedUnitCount: number;
        },
        public readonly scanAttestation?: DictionaryDocumentScanAttestation,
    ) {
        super(`Document generation failed (${category}).`);
        this.name = 'DictionaryDocumentGenerationError';
    }
}

export interface DictionaryDocumentScanAttestation {
    completedAt: Date;
    engineVersion: string;
    signatureUpdatedAt: Date;
    signatureVersion: string;
}

export interface DictionaryDocumentGenerationProcessorRequest {
    idempotencyKey: string;
    input: DictionaryDocumentTermsGenerationInputPayload;
    object: DictionaryDocumentObjectReference;
    providerBudget: DictionaryGenerationProviderBudgetPolicy;
    reportStage?: (
        stage: DictionaryGenerationExecutionStage,
        percent: number,
    ) => Promise<void>;
    signal: AbortSignal;
}

function iterableOf(bytes: Uint8Array): AsyncIterable<Uint8Array> {
    return {
        async *[Symbol.asyncIterator]() {
            yield bytes;
        },
    };
}

function sameReference(
    left: DictionaryDocumentObjectReference,
    right: DictionaryDocumentObjectReference,
): boolean {
    return (
        left.checksumSha256 === right.checksumSha256 &&
        left.contentType === right.contentType &&
        left.objectKey === right.objectKey &&
        left.sizeBytes === right.sizeBytes &&
        left.uploadId === right.uploadId &&
        left.storageVersionId === right.storageVersionId
    );
}

async function readVerifiedBytes(
    storage: PrivateDocumentStorage,
    reference: DictionaryDocumentObjectReference,
    signal: AbortSignal,
): Promise<Uint8Array> {
    const opened = await storage.openExact(reference, signal);
    if (!sameReference(opened.reference, reference))
        throw new DictionaryDocumentGenerationError('invalid_document', false);
    const chunks: Uint8Array[] = [];
    let byteLength = 0;
    const hash = createHash('sha256');
    for await (const chunk of opened.content) {
        signal.throwIfAborted();
        byteLength += chunk.byteLength;
        if (byteLength > documentIngestionLimitsV1.upload.maximumFileBytes)
            throw new DictionaryDocumentGenerationError(
                'invalid_document',
                false,
            );
        chunks.push(chunk);
        hash.update(chunk);
    }
    if (
        byteLength !== reference.sizeBytes ||
        hash.digest('hex') !== reference.checksumSha256
    )
        throw new DictionaryDocumentGenerationError('invalid_document', false);
    const bytes = new Uint8Array(byteLength);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return bytes;
}

async function runWithDeadline<T>(
    signal: AbortSignal,
    timeoutMs: number,
    operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    return operation(AbortSignal.any([signal, timeoutSignal]));
}

function validateOcrPage(
    page: {
        content: Uint8Array;
        heightPixels: number;
        pageNumber: number;
        widthPixels: number;
    },
    scanAttestation: DictionaryDocumentScanAttestation,
) {
    const pixels = page.widthPixels * page.heightPixels;
    if (
        !Number.isSafeInteger(page.pageNumber) ||
        page.pageNumber < 1 ||
        !Number.isSafeInteger(page.widthPixels) ||
        !Number.isSafeInteger(page.heightPixels) ||
        page.widthPixels < 1 ||
        page.heightPixels < 1 ||
        page.widthPixels >
            documentIngestionLimitsV1.document.maximumImageDimensionPixels ||
        page.heightPixels >
            documentIngestionLimitsV1.document.maximumImageDimensionPixels ||
        pixels > documentIngestionLimitsV1.ocr.maximumPagePixels ||
        page.content.byteLength >
            documentIngestionLimitsV1.ocr.maximumPageInputBytes
    )
        throw new DictionaryDocumentGenerationError(
            'invalid_document',
            false,
            undefined,
            scanAttestation,
        );
    return pixels;
}

export class DictionaryDocumentGenerationProcessor {
    public constructor(
        private readonly dependencies: {
            clock: { now(): Date };
            extractor: SandboxedDocumentExtractor;
            fingerprint: { fingerprint(value: unknown): string };
            ocr: DocumentOcrProvider;
            proposalGenerator: PastedTermsProposalGenerator;
            scanner: DocumentMalwareScanner;
            storage: PrivateDocumentStorage;
        },
    ) {}

    public async process(
        request: DictionaryDocumentGenerationProcessorRequest,
    ) {
        request.signal.throwIfAborted();
        await request.reportStage?.('scanning', 10);
        let bytes: Uint8Array;
        try {
            bytes = await readVerifiedBytes(
                this.dependencies.storage,
                request.object,
                request.signal,
            );
        } catch (error) {
            request.signal.throwIfAborted();
            if (error instanceof DictionaryDocumentGenerationError) throw error;
            throw new DictionaryDocumentGenerationError('scan_failed', true);
        }
        let scan;
        try {
            scan = await runWithDeadline(
                request.signal,
                documentIngestionLimitsV1.scanner.timeoutMs,
                (signal) =>
                    this.dependencies.scanner.scan({
                        content: iterableOf(bytes),
                        signal,
                    }),
            );
        } catch {
            request.signal.throwIfAborted();
            throw new DictionaryDocumentGenerationError('scan_failed', true);
        }
        const observedAttestation = scan.attestation;
        const scanAttestation = observedAttestation
            ? {
                  ...observedAttestation,
                  completedAt: this.dependencies.clock.now(),
              }
            : undefined;
        if (scan.kind === 'infected')
            throw new DictionaryDocumentGenerationError(
                'malware_detected',
                false,
                undefined,
                scanAttestation,
            );
        const signatureAgeMs =
            scan.kind === 'clean'
                ? this.dependencies.clock.now().getTime() -
                  scan.attestation.signatureUpdatedAt.getTime()
                : Number.NaN;
        if (
            scan.kind !== 'clean' ||
            scan.attestation.engineVersion.trim().length === 0 ||
            scan.attestation.signatureVersion.trim().length === 0 ||
            !Number.isFinite(scan.attestation.signatureUpdatedAt.getTime()) ||
            signatureAgeMs < 0 ||
            signatureAgeMs >
                documentIngestionLimitsV1.scanner.maximumSignatureAgeMs
        )
            throw new DictionaryDocumentGenerationError('scan_failed', true);
        const cleanScanAttestation: DictionaryDocumentScanAttestation = {
            ...scan.attestation,
            completedAt: scanAttestation!.completedAt,
        };

        await request.reportStage?.('extracting', 30);
        let extraction;
        try {
            extraction = await runWithDeadline(
                request.signal,
                documentIngestionLimitsV1.parser.wallTimeMs,
                (signal) =>
                    this.dependencies.extractor.extract({
                        content: iterableOf(bytes),
                        mediaType: request.object.contentType,
                        signal,
                    }),
            );
        } catch (error) {
            request.signal.throwIfAborted();
            if (error instanceof DictionaryDocumentGenerationError) throw error;
            throw new DictionaryDocumentGenerationError(
                'extraction_failed',
                false,
                undefined,
                cleanScanAttestation,
            );
        }
        if (
            !Array.isArray(extraction.entries) ||
            !Number.isSafeInteger(extraction.pageCount) ||
            extraction.pageCount < 1 ||
            extraction.pageCount >
                documentIngestionLimitsV1.document.maximumPages ||
            !Number.isSafeInteger(extraction.totalPixels) ||
            extraction.totalPixels < 0 ||
            extraction.totalPixels >
                documentIngestionLimitsV1.document.maximumTotalPixels
        )
            throw new DictionaryDocumentGenerationError(
                'invalid_document',
                false,
                undefined,
                cleanScanAttestation,
            );

        const blocks: DictionaryDocumentBlock[] = [];
        if (
            extraction.entries.some(
                (entry) =>
                    !entry ||
                    (entry.kind !== 'block' && entry.kind !== 'ocr-page'),
            )
        )
            throw new DictionaryDocumentGenerationError(
                'invalid_document',
                false,
                undefined,
                cleanScanAttestation,
            );
        const ocrEntries = extraction.entries.filter(
            (entry) => entry.kind === 'ocr-page',
        );
        if (ocrEntries.length > documentIngestionLimitsV1.ocr.maximumPages)
            throw new DictionaryDocumentGenerationError(
                'invalid_document',
                false,
                undefined,
                cleanScanAttestation,
            );
        let ocrPixels = 0;
        const ocrDocumentSignal = AbortSignal.any([
            request.signal,
            AbortSignal.timeout(
                documentIngestionLimitsV1.ocr.documentTimeoutMs,
            ),
        ]);
        for (const entry of extraction.entries) {
            if (entry.kind === 'block') {
                const parsedBlock = DictionaryDocumentBlockSchema.safeParse(
                    entry.block,
                );
                if (!parsedBlock.success)
                    throw new DictionaryDocumentGenerationError(
                        'invalid_document',
                        false,
                        undefined,
                        cleanScanAttestation,
                    );
                if (
                    parsedBlock.data.location.pageNumber !== null &&
                    parsedBlock.data.location.pageNumber > extraction.pageCount
                )
                    throw new DictionaryDocumentGenerationError(
                        'invalid_document',
                        false,
                        undefined,
                        cleanScanAttestation,
                    );
                blocks.push(parsedBlock.data);
                continue;
            }
            ocrPixels += validateOcrPage(entry.page, cleanScanAttestation);
            if (ocrPixels > documentIngestionLimitsV1.ocr.maximumTotalPixels)
                throw new DictionaryDocumentGenerationError(
                    'invalid_document',
                    false,
                    undefined,
                    cleanScanAttestation,
                );
            await request.reportStage?.('ocr', 40);
            try {
                const recognized = await runWithDeadline(
                    ocrDocumentSignal,
                    documentIngestionLimitsV1.ocr.pageTimeoutMs,
                    (signal) =>
                        this.dependencies.ocr.recognize({
                            idempotencyKey: `${request.idempotencyKey}/ocr/page/${entry.page.pageNumber}`,
                            page: entry.page,
                            signal,
                        }),
                );
                blocks.push(...recognized.lines);
            } catch (error) {
                request.signal.throwIfAborted();
                throw new DictionaryDocumentGenerationError(
                    'ocr_failed',
                    !(error instanceof DocumentOcrUnavailableError),
                    undefined,
                    cleanScanAttestation,
                );
            }
        }
        if (ocrPixels > extraction.totalPixels)
            throw new DictionaryDocumentGenerationError(
                'invalid_document',
                false,
                undefined,
                cleanScanAttestation,
            );
        try {
            validateDictionaryDocumentBlocks(blocks);
        } catch {
            throw new DictionaryDocumentGenerationError(
                'invalid_document',
                false,
                undefined,
                cleanScanAttestation,
            );
        }
        const terms = classifyDictionaryDocumentTerms(blocks);
        const extractionFingerprint = this.dependencies.fingerprint.fingerprint(
            terms.kind === 'review'
                ? { failures: terms.failures, rows: terms.rows }
                : terms,
        );
        if (terms.kind === 'no_terms_found')
            throw new DictionaryDocumentGenerationError(
                'no_terms_found',
                false,
                { fingerprint: extractionFingerprint, observedUnitCount: 0 },
                cleanScanAttestation,
            );
        if (terms.kind === 'too_many_terms')
            throw new DictionaryDocumentGenerationError(
                'too_many_terms',
                false,
                {
                    fingerprint: extractionFingerprint,
                    observedUnitCount: terms.extractedUnits,
                },
                cleanScanAttestation,
            );

        await request.reportStage?.('generating', 60);
        const candidates: ReturnType<
            typeof parseDictionaryBatchGenerationProposal
        >['candidates'] = [];
        const failures: ReturnType<
            typeof parseDictionaryBatchGenerationProposal
        >['failures'] = [...terms.failures];
        let inputTokens = 0;
        let outputTokens = 0;
        let costMicros = 0;
        const chunks = chunkDictionaryBatchGenerationRows(terms.rows);
        for (const [chunkIndex, rows] of chunks.entries()) {
            const remainingChunks = chunks.length - chunkIndex;
            const response = await this.dependencies.proposalGenerator.generate(
                {
                    idempotencyKey: `${request.idempotencyKey}/enrich/chunk/${chunkIndex + 1}-of-${chunks.length}`,
                    input: {
                        context: request.input.context,
                        effectiveSettings: request.input.effectiveSettings,
                        format: 'pasted-terms:v1',
                        rows,
                        sharedContext: request.input.instruction,
                    },
                    providerBudget: {
                        ...request.providerBudget,
                        maxCostMicrosPerAttempt: Math.floor(
                            (request.providerBudget.maxCostMicrosPerAttempt -
                                costMicros) /
                                remainingChunks,
                        ),
                        maxInputTokensPerAttempt: Math.floor(
                            (request.providerBudget.maxInputTokensPerAttempt -
                                inputTokens) /
                                remainingChunks,
                        ),
                        maxOutputTokensPerAttempt: Math.floor(
                            (request.providerBudget.maxOutputTokensPerAttempt -
                                outputTokens) /
                                remainingChunks,
                        ),
                    },
                    signal: request.signal,
                },
            );
            inputTokens += response.usage.inputTokens;
            outputTokens += response.usage.outputTokens;
            costMicros += dictionaryGenerationProviderUsageCostMicros(
                request.providerBudget,
                response.usage,
            );
            if (
                inputTokens > request.providerBudget.maxInputTokensPerAttempt ||
                outputTokens >
                    request.providerBudget.maxOutputTokensPerAttempt ||
                costMicros > request.providerBudget.maxCostMicrosPerAttempt
            )
                throw new DictionaryDocumentGenerationError(
                    'provider_unavailable',
                    false,
                );
            candidates.push(...response.proposal.candidates);
            failures.push(...response.proposal.failures);
        }

        await request.reportStage?.('validating', 90);
        return {
            proposal: parseDictionaryBatchGenerationProposal({
                candidates: candidates.sort(
                    (left, right) => left.rowIndex - right.rowIndex,
                ),
                failures: failures.sort(
                    (left, right) => left.rowIndex - right.rowIndex,
                ),
                warnings: [],
            }),
            providerUsage: { inputTokens, outputTokens },
            scanAttestation: cleanScanAttestation,
            extraction: {
                failureUnitCount: terms.failures.length,
                fingerprint: extractionFingerprint,
                observedUnitCount: terms.rows.length + terms.failures.length,
                validUnitCount: terms.rows.length,
            },
        };
    }
}
import { createHash } from 'node:crypto';
